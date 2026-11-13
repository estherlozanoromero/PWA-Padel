import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from '@/app/router';
import { ErrorBoundary } from '@/app/ErrorBoundary';
import { PwaLifecycle } from '@/app/PwaLifecycle';
import { CloudSyncLifecycle } from '@/app/CloudSyncLifecycle';
import '@/shared/styles/index.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('No se ha encontrado el elemento raíz de la aplicación.');
}

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <RouterProvider router={router} />
      <PwaLifecycle />
      <CloudSyncLifecycle />
    </ErrorBoundary>
  </StrictMode>,
);
