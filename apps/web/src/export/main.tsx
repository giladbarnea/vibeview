import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import { StaticSessionApp } from './StaticSessionApp';
import type { ExportPayload } from './payload';

/** ID of the JSON script node the CLI writes the session payload into. */
const DATA_NODE_ID = 'vibeview-export-data';

function readPayload(): ExportPayload | null {
  const node = document.getElementById(DATA_NODE_ID);
  if (!node?.textContent) return null;
  try {
    return JSON.parse(node.textContent) as ExportPayload;
  } catch (err) {
    console.error('vibeview: could not parse the embedded session payload', err);
    return null;
  }
}

function render() {
  const root = document.getElementById('root');
  if (!root) return;

  const payload = readPayload();
  if (!payload) {
    root.textContent = 'This exported page is missing its session data.';
    return;
  }

  createRoot(root).render(
    <StrictMode>
      <StaticSessionApp payload={payload} />
    </StrictMode>,
  );
}

render();
