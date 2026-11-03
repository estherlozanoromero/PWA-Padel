import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import { router } from '@/app/router';
import '@/shared/styles/index.css';

registerSW({ immediate: false });

const root = document.getElementById('root');

if (!root) {
  throw new Error('No se ha encontrado el elemento raíz de la aplicación.');
}

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
