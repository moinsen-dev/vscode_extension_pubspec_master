import * as vscode from 'vscode';
import { PubspecInfo } from '../../types';
import { DependencyResolver, DependencyGraph } from '../../core';

/**
 * Graph data for visualization
 */
interface GraphData {
  nodes: Array<{
    id: string;
    type: 'internal' | 'external';
    packageType?: string;
    dependencyCount: number;
    dependentCount: number;
  }>;
  links: Array<{
    source: string;
    target: string;
    type: 'direct' | 'dev';
  }>;
}

/**
 * Dependency Graph WebView Panel
 *
 * Interactive D3.js force-directed graph visualization
 * of package dependencies.
 */
export class GraphPanel implements vscode.Disposable {
  public static currentPanel: GraphPanel | undefined;
  private static readonly viewType = 'pubspecMaster.graphPanel';

  private readonly panel: vscode.WebviewPanel;
  private readonly dependencyResolver: DependencyResolver;
  private disposables: vscode.Disposable[] = [];

  private packages: PubspecInfo[] = [];
  private graph?: DependencyGraph;
  private showExternal = false;

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri
  ) {
    this.panel = panel;
    this.dependencyResolver = new DependencyResolver();

    // Set up webview
    this.panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(extensionUri, 'media'),
        vscode.Uri.joinPath(extensionUri, 'dist'),
      ],
    };

    // Handle messages from webview
    this.panel.webview.onDidReceiveMessage(
      (message) => this.handleMessage(message),
      null,
      this.disposables
    );

    // Handle panel disposal
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  /**
   * Create or show the graph panel
   */
  public static createOrShow(extensionUri: vscode.Uri): GraphPanel {
    const column = vscode.ViewColumn.Two;

    // If panel exists, show it
    if (GraphPanel.currentPanel) {
      GraphPanel.currentPanel.panel.reveal(column);
      return GraphPanel.currentPanel;
    }

    // Create new panel
    const panel = vscode.window.createWebviewPanel(
      GraphPanel.viewType,
      'Moinsen Dependency Graph',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    GraphPanel.currentPanel = new GraphPanel(panel, extensionUri);
    return GraphPanel.currentPanel;
  }

  /**
   * Update the graph with new package data
   */
  public async updateData(packages: PubspecInfo[]): Promise<void> {
    this.packages = packages;
    this.graph = this.dependencyResolver.buildGraph(packages);
    await this.updateWebview();
  }

  /**
   * Handle messages from the webview
   */
  private async handleMessage(message: {
    command: string;
    packageName?: string;
    showExternal?: boolean;
    svgData?: string;
    pngData?: string;
    filename?: string;
    error?: string;
  }): Promise<void> {
    switch (message.command) {
      case 'openPubspec':
        if (message.packageName) {
          const pkg = this.packages.find((p) => p.name === message.packageName);
          if (pkg) {
            await vscode.commands.executeCommand(
              'pubspecMaster.openPubspec',
              pkg.path
            );
          }
        }
        break;

      case 'toggleExternal':
        this.showExternal = message.showExternal ?? !this.showExternal;
        await this.updateWebview();
        break;

      case 'refresh':
        await vscode.commands.executeCommand('pubspecMaster.refresh');
        break;

      case 'exportSvg':
        if (message.svgData) {
          await this.handleExportSvg(message.svgData);
        }
        break;

      case 'exportPng':
        if (message.pngData) {
          await this.handleExportPng(message.pngData);
        }
        break;

      case 'exportError':
        vscode.window.showErrorMessage(`PNG Export failed: ${message.error || 'Unknown error'}`);
        break;
    }
  }

  /**
   * Handle SVG export
   */
  private async handleExportSvg(svgData: string): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const defaultUri = workspaceFolder
      ? vscode.Uri.joinPath(workspaceFolder.uri, 'dependency-graph.svg')
      : undefined;

    const uri = await vscode.window.showSaveDialog({
      defaultUri,
      filters: { 'SVG Files': ['svg'] },
      title: 'Export Dependency Graph as SVG',
    });

    if (uri) {
      const encoder = new TextEncoder();
      await vscode.workspace.fs.writeFile(uri, encoder.encode(svgData));
      vscode.window.showInformationMessage(`Graph exported to ${uri.fsPath}`);
    }
  }

  /**
   * Handle PNG export
   */
  private async handleExportPng(pngData: string): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const defaultUri = workspaceFolder
      ? vscode.Uri.joinPath(workspaceFolder.uri, 'dependency-graph.png')
      : undefined;

    const uri = await vscode.window.showSaveDialog({
      defaultUri,
      filters: { 'PNG Files': ['png'] },
      title: 'Export Dependency Graph as PNG',
    });

    if (uri) {
      // Remove data URL prefix and decode base64
      const base64Data = pngData.replace(/^data:image\/png;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      await vscode.workspace.fs.writeFile(uri, buffer);
      vscode.window.showInformationMessage(`Graph exported to ${uri.fsPath}`);
    }
  }

  /**
   * Update the webview content
   */
  private async updateWebview(): Promise<void> {
    this.panel.webview.html = this.getHtmlContent();

    if (this.graph) {
      const graphData = this.buildGraphData(this.graph);
      await this.panel.webview.postMessage({
        command: 'updateGraph',
        data: graphData,
      });
    }
  }

  /**
   * Build graph data for D3.js
   */
  private buildGraphData(graph: DependencyGraph): GraphData {
    const nodes: GraphData['nodes'] = [];
    const links: GraphData['links'] = [];
    const includedNodes = new Set<string>();

    // Add internal packages
    for (const name of graph.internalPackages) {
      const node = graph.nodes.get(name);
      if (node) {
        includedNodes.add(name);
        nodes.push({
          id: name,
          type: 'internal',
          packageType: node.packageType,
          dependencyCount: node.dependencies.length,
          dependentCount: node.dependents.length,
        });
      }
    }

    // Optionally add external packages
    if (this.showExternal) {
      for (const name of graph.externalPackages) {
        const node = graph.nodes.get(name);
        if (node) {
          includedNodes.add(name);
          nodes.push({
            id: name,
            type: 'external',
            dependencyCount: 0,
            dependentCount: node.dependents.length,
          });
        }
      }
    }

    // Add edges
    for (const edge of graph.edges) {
      if (includedNodes.has(edge.from) && includedNodes.has(edge.to)) {
        links.push({
          source: edge.from,
          target: edge.to,
          type: edge.type === 'dev' ? 'dev' : 'direct',
        });
      }
    }

    return { nodes, links };
  }

  /**
   * Get the HTML content for the webview
   */
  private getHtmlContent(): string {
    const webview = this.panel.webview;
    const nonce = this.getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} data:; font-src ${webview.cspSource};">
  <title>Moinsen Dependency Graph</title>
  <style>
    :root {
      --pm-primary: var(--vscode-button-background);
      --pm-background: var(--vscode-editor-background);
      --pm-surface: var(--vscode-sideBar-background);
      --pm-text: var(--vscode-editor-foreground);
      --pm-border: var(--vscode-panel-border);
      --pm-flutter-app: #2196F3;
      --pm-flutter-plugin: #9C27B0;
      --pm-dart-package: #4CAF50;
      --pm-external: #9E9E9E;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: var(--vscode-font-family);
      background-color: var(--pm-background);
      color: var(--pm-text);
      overflow: hidden;
    }

    .toolbar {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: 48px;
      background-color: var(--pm-surface);
      border-bottom: 1px solid var(--pm-border);
      display: flex;
      align-items: center;
      padding: 0 16px;
      gap: 16px;
      z-index: 100;
    }

    .toolbar-title {
      font-weight: 600;
      font-size: 14px;
    }

    .toolbar-spacer { flex: 1; }

    .btn {
      padding: 6px 12px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      display: flex;
      align-items: center;
      gap: 4px;
      background-color: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }

    .btn:hover { background-color: var(--vscode-button-secondaryHoverBackground); }
    .btn.active { background-color: var(--pm-primary); color: var(--vscode-button-foreground); }

    .graph-container {
      position: fixed;
      top: 48px;
      left: 0;
      right: 0;
      bottom: 0;
    }

    svg { width: 100%; height: 100%; }

    .node { cursor: pointer; }
    .node circle { stroke-width: 2px; stroke: var(--pm-background); }
    .node.flutter-app circle { fill: var(--pm-flutter-app); }
    .node.flutter-plugin circle { fill: var(--pm-flutter-plugin); }
    .node.dart-package circle { fill: var(--pm-dart-package); }
    .node.external circle { fill: var(--pm-external); }

    .node text {
      font-size: 11px;
      fill: var(--pm-text);
      text-anchor: middle;
      pointer-events: none;
    }

    .node:hover circle { stroke: var(--pm-primary); stroke-width: 3px; }

    .link { stroke-opacity: 0.6; fill: none; }
    .link.direct { stroke: var(--pm-text); stroke-width: 1.5px; }
    .link.dev { stroke: var(--pm-text); stroke-width: 1px; stroke-dasharray: 4,2; }

    .tooltip {
      position: absolute;
      background-color: var(--pm-surface);
      border: 1px solid var(--pm-border);
      border-radius: 4px;
      padding: 8px 12px;
      font-size: 12px;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.2s;
      z-index: 200;
    }

    .tooltip.visible { opacity: 1; }
    .tooltip-title { font-weight: 600; margin-bottom: 4px; }
    .tooltip-detail { color: var(--vscode-descriptionForeground); }

    .legend {
      position: fixed;
      bottom: 16px;
      left: 16px;
      background-color: var(--pm-surface);
      border: 1px solid var(--pm-border);
      border-radius: 6px;
      padding: 12px;
      font-size: 11px;
    }

    .legend-item { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
    .legend-item:last-child { margin-bottom: 0; }
    .legend-dot { width: 12px; height: 12px; border-radius: 50%; }
    .legend-dot.flutter-app { background-color: var(--pm-flutter-app); }
    .legend-dot.flutter-plugin { background-color: var(--pm-flutter-plugin); }
    .legend-dot.dart-package { background-color: var(--pm-dart-package); }
    .legend-dot.external { background-color: var(--pm-external); }

    .empty-state {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      text-align: center;
      color: var(--vscode-descriptionForeground);
    }

    .empty-state-icon { font-size: 48px; margin-bottom: 16px; }
  </style>
</head>
<body>
  <div class="toolbar">
    <span class="toolbar-title">Dependency Graph</span>
    <div class="toolbar-spacer"></div>
    <button class="btn" id="btn-toggle-external">
      <span>&#128065;</span> Show External
    </button>
    <button class="btn" id="btn-reset-zoom">
      <span>&#128269;</span> Reset View
    </button>
    <button class="btn" id="btn-export-svg">
      <span>&#128190;</span> Export SVG
    </button>
    <button class="btn" id="btn-export-png">
      <span>&#128247;</span> Export PNG
    </button>
    <button class="btn" id="btn-refresh">
      <span>&#128260;</span> Refresh
    </button>
  </div>

  <div class="graph-container" id="graph-container">
    <svg id="graph-svg"></svg>
  </div>

  <div class="tooltip" id="tooltip">
    <div class="tooltip-title" id="tooltip-title"></div>
    <div class="tooltip-detail" id="tooltip-detail"></div>
  </div>

  <div class="legend">
    <div class="legend-item">
      <div class="legend-dot flutter-app"></div>
      <span>Flutter App</span>
    </div>
    <div class="legend-item">
      <div class="legend-dot flutter-plugin"></div>
      <span>Flutter Plugin</span>
    </div>
    <div class="legend-item">
      <div class="legend-dot dart-package"></div>
      <span>Dart Package</span>
    </div>
    <div class="legend-item" id="legend-external" style="display: none;">
      <div class="legend-dot external"></div>
      <span>External</span>
    </div>
  </div>

  <div class="empty-state" id="empty-state">
    <div class="empty-state-icon">&#128279;</div>
    <div>No packages to display</div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let showExternal = false;
    let graphData = null;
    let simulation = null;

    // Setup event listeners
    document.getElementById('btn-toggle-external').addEventListener('click', function() {
      showExternal = !showExternal;
      this.classList.toggle('active', showExternal);
      document.getElementById('legend-external').style.display = showExternal ? 'flex' : 'none';
      vscode.postMessage({ command: 'toggleExternal', showExternal: showExternal });
    });

    document.getElementById('btn-reset-zoom').addEventListener('click', function() {
      resetZoom();
    });

    document.getElementById('btn-refresh').addEventListener('click', function() {
      vscode.postMessage({ command: 'refresh' });
    });

    document.getElementById('btn-export-svg').addEventListener('click', function() {
      exportSvg();
    });

    document.getElementById('btn-export-png').addEventListener('click', function() {
      exportPng();
    });

    // Message handler
    window.addEventListener('message', function(event) {
      const message = event.data;
      if (message.command === 'updateGraph') {
        graphData = message.data;
        renderGraph(graphData);
      }
    });

    function renderGraph(data) {
      const container = document.getElementById('graph-container');
      const svg = document.getElementById('graph-svg');
      const emptyState = document.getElementById('empty-state');

      // Clear previous content
      while (svg.firstChild) {
        svg.removeChild(svg.firstChild);
      }

      if (!data || data.nodes.length === 0) {
        emptyState.style.display = 'block';
        return;
      }
      emptyState.style.display = 'none';

      const width = container.clientWidth;
      const height = container.clientHeight;

      // Create SVG groups
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      svg.appendChild(g);

      const linksGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      linksGroup.setAttribute('class', 'links');
      g.appendChild(linksGroup);

      const nodesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      nodesGroup.setAttribute('class', 'nodes');
      g.appendChild(nodesGroup);

      // Create node map
      const nodeMap = new Map();
      data.nodes.forEach(function(node) {
        nodeMap.set(node.id, {
          ...node,
          x: width / 2 + (Math.random() - 0.5) * 200,
          y: height / 2 + (Math.random() - 0.5) * 200
        });
      });

      // Create links
      const linkElements = [];
      data.links.forEach(function(link) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('class', 'link ' + link.type);
        linksGroup.appendChild(line);
        linkElements.push({ element: line, source: link.source, target: link.target });
      });

      // Create nodes
      const nodeElements = [];

      // Drag state (shared across all nodes)
      let draggedNode = null;
      let draggedNodeData = null;

      data.nodes.forEach(function(node) {
        const nodeData = nodeMap.get(node.id);
        const nodeClass = node.type === 'external' ? 'external' : (node.packageType || 'dart-package').replace('_', '-');

        const nodeG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        nodeG.setAttribute('class', 'node ' + nodeClass);
        nodeG.setAttribute('transform', 'translate(' + nodeData.x + ',' + nodeData.y + ')');

        const radius = node.type === 'external' ? 8 : 12;
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('r', radius);
        nodeG.appendChild(circle);

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('dy', radius + 12);
        text.textContent = node.id;
        nodeG.appendChild(text);

        // Event handlers
        nodeG.addEventListener('click', function() {
          vscode.postMessage({ command: 'openPubspec', packageName: node.id });
        });

        nodeG.addEventListener('mouseenter', function(e) {
          showTooltip(node, e.pageX, e.pageY);
        });

        nodeG.addEventListener('mouseleave', function() {
          hideTooltip();
        });

        // Drag handling - mousedown starts drag
        nodeG.addEventListener('mousedown', function(e) {
          draggedNode = node;
          draggedNodeData = nodeData;
          nodeG.style.cursor = 'grabbing';
          e.preventDefault();
          e.stopPropagation();
        });

        nodesGroup.appendChild(nodeG);
        nodeElements.push({ element: nodeG, node: nodeData, id: node.id });
      });

      // Simple force simulation velocities
      let velocities = new Map();
      data.nodes.forEach(function(n) {
        velocities.set(n.id, { vx: 0, vy: 0 });
      });

      // Document-level mouse handlers for drag
      document.addEventListener('mousemove', function(e) {
        if (!draggedNode || !draggedNodeData) return;
        const rect = svg.getBoundingClientRect();
        draggedNodeData.x = e.clientX - rect.left;
        draggedNodeData.y = e.clientY - rect.top;
        // Reset velocity when dragging
        velocities.set(draggedNode.id, { vx: 0, vy: 0 });
      });

      document.addEventListener('mouseup', function() {
        if (draggedNode) {
          const nodeEl = nodeElements.find(function(n) { return n.id === draggedNode.id; });
          if (nodeEl) {
            nodeEl.element.style.cursor = '';
          }
        }
        draggedNode = null;
        draggedNodeData = null;
      });

      function tick() {
        // Apply forces
        data.nodes.forEach(function(node) {
          const n = nodeMap.get(node.id);
          const v = velocities.get(node.id);

          // Center force
          v.vx += (width / 2 - n.x) * 0.001;
          v.vy += (height / 2 - n.y) * 0.001;

          // Repulsion from other nodes
          data.nodes.forEach(function(other) {
            if (other.id === node.id) return;
            const o = nodeMap.get(other.id);
            const dx = n.x - o.x;
            const dy = n.y - o.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const force = 500 / (dist * dist);
            v.vx += dx / dist * force;
            v.vy += dy / dist * force;
          });
        });

        // Link forces
        data.links.forEach(function(link) {
          const source = nodeMap.get(link.source);
          const target = nodeMap.get(link.target);
          const sv = velocities.get(link.source);
          const tv = velocities.get(link.target);
          const dx = target.x - source.x;
          const dy = target.y - source.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const targetDist = 100;
          const force = (dist - targetDist) * 0.01;
          sv.vx += dx / dist * force;
          sv.vy += dy / dist * force;
          tv.vx -= dx / dist * force;
          tv.vy -= dy / dist * force;
        });

        // Apply velocities with damping
        data.nodes.forEach(function(node) {
          const n = nodeMap.get(node.id);
          const v = velocities.get(node.id);
          v.vx *= 0.9;
          v.vy *= 0.9;
          n.x += v.vx;
          n.y += v.vy;
        });

        // Update positions
        nodeElements.forEach(function(ne) {
          const n = nodeMap.get(ne.id);
          ne.element.setAttribute('transform', 'translate(' + n.x + ',' + n.y + ')');
        });

        linkElements.forEach(function(le) {
          const source = nodeMap.get(le.source);
          const target = nodeMap.get(le.target);
          le.element.setAttribute('x1', source.x);
          le.element.setAttribute('y1', source.y);
          le.element.setAttribute('x2', target.x);
          le.element.setAttribute('y2', target.y);
        });

        simulation = requestAnimationFrame(tick);
      }

      tick();
    }

    function showTooltip(node, x, y) {
      const tooltip = document.getElementById('tooltip');
      const title = document.getElementById('tooltip-title');
      const detail = document.getElementById('tooltip-detail');

      title.textContent = node.id;
      var typeText = node.type === 'external' ? 'External Package' :
        (node.packageType === 'flutter_app' ? 'Flutter App' :
         node.packageType === 'flutter_plugin' ? 'Flutter Plugin' : 'Dart Package');
      detail.textContent = typeText + ' \\u2022 ' + node.dependencyCount + ' deps \\u2022 ' + node.dependentCount + ' dependents';

      tooltip.style.left = (x + 10) + 'px';
      tooltip.style.top = (y + 10) + 'px';
      tooltip.classList.add('visible');
    }

    function hideTooltip() {
      document.getElementById('tooltip').classList.remove('visible');
    }

    function resetZoom() {
      // Re-render to reset positions
      if (graphData) {
        renderGraph(graphData);
      }
    }

    function exportSvg() {
      const svg = document.getElementById('graph-svg');
      if (!svg || !graphData || graphData.nodes.length === 0) {
        return;
      }

      // Clone the SVG for export
      const clone = svg.cloneNode(true);

      // Get computed styles from CSS variables
      const styles = getComputedStyle(document.body);
      const bgColor = styles.getPropertyValue('--pm-background').trim() || '#1e1e1e';
      const textColor = styles.getPropertyValue('--pm-text').trim() || '#d4d4d4';
      const flutterAppColor = styles.getPropertyValue('--pm-flutter-app').trim() || '#2196F3';
      const flutterPluginColor = styles.getPropertyValue('--pm-flutter-plugin').trim() || '#9C27B0';
      const dartPackageColor = styles.getPropertyValue('--pm-dart-package').trim() || '#4CAF50';
      const externalColor = styles.getPropertyValue('--pm-external').trim() || '#9E9E9E';

      // Add inline styles for standalone SVG
      const styleElement = document.createElementNS('http://www.w3.org/2000/svg', 'style');
      styleElement.textContent =
        'svg { background-color: ' + bgColor + '; } ' +
        '.node circle { stroke-width: 2px; stroke: ' + bgColor + '; } ' +
        '.node.flutter-app circle { fill: ' + flutterAppColor + '; } ' +
        '.node.flutter-plugin circle { fill: ' + flutterPluginColor + '; } ' +
        '.node.dart-package circle { fill: ' + dartPackageColor + '; } ' +
        '.node.external circle { fill: ' + externalColor + '; } ' +
        '.node text { font-size: 11px; fill: ' + textColor + '; text-anchor: middle; font-family: sans-serif; } ' +
        '.link { stroke-opacity: 0.6; fill: none; } ' +
        '.link.direct { stroke: ' + textColor + '; stroke-width: 1.5px; } ' +
        '.link.dev { stroke: ' + textColor + '; stroke-width: 1px; stroke-dasharray: 4,2; }';
      clone.insertBefore(styleElement, clone.firstChild);

      // Set proper dimensions
      const container = document.getElementById('graph-container');
      clone.setAttribute('width', container.clientWidth);
      clone.setAttribute('height', container.clientHeight);
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

      // Serialize to string
      const serializer = new XMLSerializer();
      const svgString = serializer.serializeToString(clone);
      const svgData = '<?xml version="1.0" encoding="UTF-8"?>\\n' + svgString;

      vscode.postMessage({ command: 'exportSvg', svgData: svgData });
    }

    function exportPng() {
      const svg = document.getElementById('graph-svg');
      if (!svg || !graphData || graphData.nodes.length === 0) {
        return;
      }

      // Clone the SVG for export
      const clone = svg.cloneNode(true);

      // Get computed styles from CSS variables
      const styles = getComputedStyle(document.body);
      const bgColor = styles.getPropertyValue('--pm-background').trim() || '#1e1e1e';
      const textColor = styles.getPropertyValue('--pm-text').trim() || '#d4d4d4';
      const flutterAppColor = styles.getPropertyValue('--pm-flutter-app').trim() || '#2196F3';
      const flutterPluginColor = styles.getPropertyValue('--pm-flutter-plugin').trim() || '#9C27B0';
      const dartPackageColor = styles.getPropertyValue('--pm-dart-package').trim() || '#4CAF50';
      const externalColor = styles.getPropertyValue('--pm-external').trim() || '#9E9E9E';

      // Add inline styles for standalone SVG
      const styleElement = document.createElementNS('http://www.w3.org/2000/svg', 'style');
      styleElement.textContent =
        'svg { background-color: ' + bgColor + '; } ' +
        '.node circle { stroke-width: 2px; stroke: ' + bgColor + '; } ' +
        '.node.flutter-app circle { fill: ' + flutterAppColor + '; } ' +
        '.node.flutter-plugin circle { fill: ' + flutterPluginColor + '; } ' +
        '.node.dart-package circle { fill: ' + dartPackageColor + '; } ' +
        '.node.external circle { fill: ' + externalColor + '; } ' +
        '.node text { font-size: 11px; fill: ' + textColor + '; text-anchor: middle; font-family: sans-serif; } ' +
        '.link { stroke-opacity: 0.6; fill: none; } ' +
        '.link.direct { stroke: ' + textColor + '; stroke-width: 1.5px; } ' +
        '.link.dev { stroke: ' + textColor + '; stroke-width: 1px; stroke-dasharray: 4,2; }';
      clone.insertBefore(styleElement, clone.firstChild);

      // Set proper dimensions
      const container = document.getElementById('graph-container');
      const width = container.clientWidth;
      const height = container.clientHeight;
      clone.setAttribute('width', width);
      clone.setAttribute('height', height);
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

      // Serialize SVG to data URL
      const serializer = new XMLSerializer();
      const svgString = serializer.serializeToString(clone);
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      // Create canvas and render SVG
      const img = new Image();
      let exportCompleted = false;

      // Timeout to prevent hanging indefinitely
      const exportTimeout = setTimeout(function() {
        if (!exportCompleted) {
          exportCompleted = true;
          URL.revokeObjectURL(url);
          vscode.postMessage({ command: 'exportError', error: 'PNG export timed out' });
        }
      }, 10000); // 10 second timeout

      img.onload = function() {
        if (exportCompleted) return;
        exportCompleted = true;
        clearTimeout(exportTimeout);

        const canvas = document.createElement('canvas');
        canvas.width = width * 2; // 2x for higher resolution
        canvas.height = height * 2;
        const ctx = canvas.getContext('2d');
        ctx.scale(2, 2);
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);

        const pngData = canvas.toDataURL('image/png');
        vscode.postMessage({ command: 'exportPng', pngData: pngData });
      };

      img.onerror = function() {
        if (exportCompleted) return;
        exportCompleted = true;
        clearTimeout(exportTimeout);
        URL.revokeObjectURL(url);
        vscode.postMessage({ command: 'exportError', error: 'Failed to load SVG for PNG export' });
      };

      img.src = url;
    }

    // Cleanup on unload
    window.addEventListener('unload', function() {
      if (simulation) {
        cancelAnimationFrame(simulation);
      }
    });
  </script>
</body>
</html>`;
  }

  /**
   * Generate a nonce for Content Security Policy
   */
  private getNonce(): string {
    let text = '';
    const possible =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    GraphPanel.currentPanel = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      const disposable = this.disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}
