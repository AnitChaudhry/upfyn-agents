/**
 * Sidebar state for project navigation.
 */
export class SidebarState {
  constructor() {
    this.visible = false;
    this.focused = false;
    this.projects = [];
    this.selectedProject = 0;
  }

  toggle() {
    this.visible = !this.visible;
    if (!this.visible) this.focused = false;
  }

  focus() { this.focused = true; }
  unfocus() { this.focused = false; }

  moveUp() {
    if (this.selectedProject > 0) this.selectedProject--;
  }

  moveDown() {
    if (this.selectedProject < this.projects.length - 1) this.selectedProject++;
  }

  selectedProjectInfo() {
    return this.projects[this.selectedProject] || null;
  }
}
