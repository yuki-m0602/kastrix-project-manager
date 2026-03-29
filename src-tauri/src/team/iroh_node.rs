//! iroh 接続基盤
//!
//! Endpoint, Gossip, Router の初期化・終了・状態管理

use iroh::protocol::Router;
use iroh::{Endpoint, NodeId, Watcher};
use iroh_base::ticket::NodeTicket;
use iroh_base::SecretKey;
use iroh_gossip::api::{GossipReceiver, GossipSender};
use iroh_gossip::net::Gossip;
use iroh_gossip::proto::TopicId;
use iroh_gossip::ALPN;
use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;
use tokio::sync::RwLock;

const SECRET_FILENAME: &str = "iroh_secret.bin";

/// iroh ノードの状態
pub struct IrohNodeState {
    router: Arc<Router>,
    gossip: Arc<Gossip>,
    /// アクティブなトピック購読（TopicId hex -> GossipSender）。Sender を保持することで購読を維持
    subscriptions: Arc<RwLock<HashMap<String, GossipSender>>>,
}

impl IrohNodeState {
    fn endpoint(&self) -> &Endpoint {
        self.router.endpoint()
    }

    /// 秘密鍵を読み込みまたは生成して永続化（再起動後も同じ EndpointID を維持）
    fn load_or_create_secret_key(app_data_dir: &Path) -> Result<SecretKey, String> {
        let path = app_data_dir.join(SECRET_FILENAME);
        if path.exists() {
            let bytes: [u8; 32] = std::fs::read(&path)
                .map_err(|e| format!("iroh secret key read failed: {}", e))?
                .try_into()
                .map_err(|_| "iroh secret key invalid length (expected 32 bytes)".to_string())?;
            Ok(SecretKey::from_bytes(&bytes))
        } else {
            let mut bytes = [0u8; 32];
            getrandom::getrandom(&mut bytes).map_err(|e| format!("random bytes failed: {}", e))?;
            let key = SecretKey::from_bytes(&bytes);
            std::fs::write(&path, &bytes)
                .map_err(|e| format!("iroh secret key save failed: {}", e))?;
            Ok(key)
        }
    }

    /// iroh ノードを初期化（Endpoint, Gossip, Router）
    /// app_data_dir: 秘密鍵を保存するディレクトリ
    pub async fn init(app_data_dir: &Path) -> Result<Self, String> {
        let secret_key = Self::load_or_create_secret_key(app_data_dir)?;
        let endpoint = Endpoint::builder()
            .secret_key(secret_key)
            .alpns(vec![ALPN.to_vec()])
            .discovery_n0()
            .bind()
            .await
            .map_err(|e| format!("iroh bind failed: {}", e))?;

        let gossip = Gossip::builder().spawn(endpoint.clone());
        let gossip = Arc::new(gossip);

        let router = Router::builder(endpoint)
            .accept(ALPN, gossip.clone())
            .spawn();

        Ok(Self {
            router: Arc::new(router),
            gossip,
            subscriptions: Arc::new(RwLock::new(HashMap::new())),
        })
    }

    /// このノードの NodeId（EndpointID）を取得
    pub fn node_id(&self) -> NodeId {
        self.endpoint().node_id()
    }

    /// このノードの NodeTicket を取得（招待用）
    pub async fn node_ticket(&self) -> Result<NodeTicket, String> {
        let mut watcher = self.endpoint().node_addr();
        let node_addr = tokio::time::timeout(
            std::time::Duration::from_secs(15),
            watcher.initialized(),
        )
        .await
        .map_err(|_| {
            "ノードの初期化がタイムアウトしました。ネットワーク接続を確認して再度お試しください。"
                .to_string()
        })?;
        Ok(NodeTicket::new(node_addr))
    }

    /// リモートノードのアドレスを追加（招待コードから参加する際に使用）
    pub fn add_node_addr(&self, ticket: &NodeTicket) -> Result<(), String> {
        let node_addr = ticket.node_addr().clone();
        self.endpoint()
            .add_node_addr(node_addr)
            .map_err(|e| format!("add_node_addr failed: {}", e))
    }

    /// TopicId に subscribe（ホスト: bootstrap=[]、メンバー: bootstrap=[host_node_id]）
    /// 購読は subscriptions に保持。receiver を返す（ホストは NeighborUp をリッスンして参加申請を受信）
    pub async fn subscribe(
        &self,
        topic_id: TopicId,
        topic_id_hex: &str,
        bootstrap: Vec<NodeId>,
    ) -> Result<GossipReceiver, String> {
        let key = topic_id_hex.to_ascii_lowercase();
        let topic = self
            .gossip
            .subscribe(topic_id, bootstrap)
            .await
            .map_err(|e| format!("gossip subscribe failed: {}", e))?;
        let (sender, receiver) = topic.split();
        self.subscriptions.write().await.insert(key, sender);
        Ok(receiver)
    }

    /// トピックの GossipSender を取得（subscribe 済みの場合、broadcast 用）
    pub async fn get_sender(&self, topic_id_hex: &str) -> Option<GossipSender> {
        let map = self.subscriptions.read().await;
        let lower = topic_id_hex.to_ascii_lowercase();
        map.get(&lower).cloned().or_else(|| {
            map.iter()
                .find(|(k, _)| k.eq_ignore_ascii_case(topic_id_hex))
                .map(|(_, v)| v.clone())
        })
    }

    /// topic hex（大文字小文字無視）に対応する送信ハンドル（member_join 等で正しいトピックへ送る）
    pub async fn get_senders_for_topic_hex(&self, topic_hex: &str) -> Vec<GossipSender> {
        if let Some(s) = self.get_sender(topic_hex).await {
            return vec![s];
        }
        vec![]
    }

    /// 全トピックの GossipSender を取得（task_update broadcast 用）
    pub async fn get_all_senders(&self) -> Vec<GossipSender> {
        self.subscriptions.read().await.values().cloned().collect()
    }

    /// 購読中のトピックID一覧を取得（ルーム表示用）
    pub async fn get_subscription_topic_ids(&self) -> Vec<String> {
        self.subscriptions.read().await.keys().cloned().collect()
    }

    /// トピックの購読を解除（参加申請キャンセル時など）
    pub async fn unsubscribe(&self, topic_id_hex: &str) -> bool {
        let mut map = self.subscriptions.write().await;
        let lower = topic_id_hex.to_ascii_lowercase();
        if map.remove(&lower).is_some() {
            return true;
        }
        let key = map
            .keys()
            .find(|k| k.eq_ignore_ascii_case(topic_id_hex))
            .cloned();
        key.map(|k| map.remove(&k).is_some()).unwrap_or(false)
    }
}

/// アプリ全体で共有する iroh 状態（初期化失敗時は None）
pub type IrohState = Arc<RwLock<Option<IrohNodeState>>>;
