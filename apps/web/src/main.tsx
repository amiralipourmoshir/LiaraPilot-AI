import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { WorkspaceShell } from './components/workspace-shell';
import { Loading, NotFound } from './components/common';
const CloudApplicationsPage = lazy(() =>
  import('./pages/cloud').then((module) => ({ default: module.CloudApplicationsPage })),
);
const CloudApplicationDetailPage = lazy(() =>
  import('./pages/cloud').then((module) => ({ default: module.CloudApplicationDetailPage })),
);
const AuthPage = lazy(() =>
  import('./pages/auth').then((module) => ({ default: module.AuthPage })),
);
const FoundationPage = lazy(() =>
  import('./pages/foundation').then((module) => ({ default: module.FoundationPage })),
);
const OverviewPage = lazy(() =>
  import('./pages/overview').then((module) => ({ default: module.OverviewPage })),
);
const AssistantPage = lazy(() =>
  import('./pages/assistant').then((module) => ({ default: module.AssistantPage })),
);
const ProjectsPage = lazy(() =>
  import('./pages/projects').then((module) => ({ default: module.ProjectsPage })),
);
const ProjectDetailPage = lazy(() =>
  import('./pages/projects').then((module) => ({ default: module.ProjectDetailPage })),
);
const DeploymentsPage = lazy(() =>
  import('./pages/operations').then((module) => ({ default: module.DeploymentsPage })),
);
const DeploymentDetailPage = lazy(() =>
  import('./pages/operations').then((module) => ({ default: module.DeploymentDetailPage })),
);
const OperationsPage = lazy(() =>
  import('./pages/operations').then((module) => ({ default: module.OperationsPage })),
);
const MonitoringPage = lazy(() =>
  import('./pages/monitoring').then((module) => ({ default: module.MonitoringPage })),
);
const IncidentsPage = lazy(() =>
  import('./pages/monitoring').then((module) => ({ default: module.IncidentsPage })),
);
const IncidentDetailPage = lazy(() =>
  import('./pages/monitoring').then((module) => ({ default: module.IncidentDetailPage })),
);
const LogsPage = lazy(() =>
  import('./pages/monitoring').then((module) => ({ default: module.LogsPage })),
);
const ConnectionsPage = lazy(() =>
  import('./pages/settings').then((module) => ({ default: module.ConnectionsPage })),
);
const SettingsPage = lazy(() =>
  import('./pages/settings').then((module) => ({ default: module.SettingsPage })),
);
import './styles.css';
import './workspace.css';
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
function workspaceRoutes() {
  return (
    <>
      <Route index element={<OverviewPage />} />
      <Route path="assistant" element={<AssistantPage />} />
      <Route path="projects" element={<ProjectsPage />} />
      <Route path="projects/:id" element={<ProjectDetailPage />} />
      <Route path="deployments" element={<DeploymentsPage />} />
      <Route path="deployments/:id" element={<DeploymentDetailPage />} />
      <Route path="monitoring" element={<MonitoringPage />} />
      <Route path="incidents" element={<IncidentsPage />} />
      <Route path="incidents/:id" element={<IncidentDetailPage />} />
      <Route path="logs" element={<LogsPage />} />
      <Route path="operations" element={<OperationsPage />} />
      <Route path="connections" element={<ConnectionsPage />} />
      <Route path="settings" element={<SettingsPage />} />
      <Route path="*" element={<NotFound />} />
    </>
  );
}
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <a href="#main-content" className="skip-link">
          رفتن به محتوا
        </a>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<Navigate to="/workspace" replace />} />
            <Route path="/login" element={<AuthPage key="login" />} />
            <Route path="/register" element={<AuthPage key="register" register />} />
            <Route path="/workspace" element={<WorkspaceShell />}>
              {workspaceRoutes()}
              <Route path="foundation" element={<FoundationPage />} />
              <Route path="applications" element={<CloudApplicationsPage />} />
              <Route path="applications/:id" element={<CloudApplicationDetailPage />} />
            </Route>
            <Route path="/demo" element={<WorkspaceShell preview />}>
              {workspaceRoutes()}
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
        <Toaster dir="rtl" position="bottom-left" richColors />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
