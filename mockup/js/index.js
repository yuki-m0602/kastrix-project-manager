// Module exports
import { state, fixFilterIconSizes, pushModalHistory, getModalHistory } from './state.js';
import * as sidebar from './sidebar.js';
import * as tabs from './tabs.js';
import * as views from './views.js';
import * as tasks from './tasks.js';
import * as projects from './projects.js';
import { init } from './main.js';

// Export all functions for global access
window.toggleSidebar = sidebar.toggleSidebar;
window.openMobileSidebar = sidebar.openMobileSidebar;
window.closeMobileSidebar = sidebar.closeMobileSidebar;
window.setActiveMenu = sidebar.setActiveMenu;
window.toggleAiChat = sidebar.toggleAiChat;

window.setActiveTab = tabs.setActiveTab;
window.renderTabs = tabs.renderTabs;
window.updateContent = tabs.updateContent;
window.addProjectTab = tabs.addProjectTab;
window.removeProjectTab = tabs.removeProjectTab;
window.switchMainTab = tabs.switchMainTab;

window.setTaskView = views.setTaskView;
window.setProjectViewMode = views.setProjectViewMode;
window.filterTasks = views.filterTasks;
window.sortTasks = views.sortTasks;
window.filterProjectsByLang = views.filterProjectsByLang;
window.sortProjects = views.sortProjects;

window.renderTaskList = tasks.renderTaskList;
window.renderKanban = tasks.renderKanban;
window.openTaskModal = tasks.openTaskModal;
window.closeTaskModal = tasks.closeTaskModal;
window.createTask = tasks.createTask;
window.updateTask = tasks.updateTask;
window.deleteTask = tasks.deleteTask;

window.renderProjects = projects.renderProjects;
window.openProjectDetailModal = projects.openProjectDetailModal;
window.closeProjectDetailModal = projects.closeProjectDetailModal;
window.launchIDE = projects.launchIDE;

// View functions
window.toggleDropdown = views.toggleDropdown;
window.setTaskStatus = views.setTaskStatus;
window.setTaskSort = views.setTaskSort;
window.setProjLang = views.setProjLang;
window.setProjSort = views.setProjSort;

// Modal history
window.pushModalHistory = pushModalHistory;
window.getModalHistory = getModalHistory;
window.fixFilterIconSizes = fixFilterIconSizes;

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Initialize UI after init
setTimeout(() => {
  // Start with default state
  sidebar.setActiveMenu('overview');
  tabs.switchMainTab('tasks');
  views.setTaskView('list');
  views.setProjectViewMode('grid');
  
  // Fix filter icon sizes
  fixFilterIconSizes();
}, 0);

// Expose state for debugging
window.appState = state;