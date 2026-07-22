import { createHashRouter } from 'react-router-dom';
import App from './App';
import TransactionsPage from '@/pages/TransactionsPage';
import ReportPage from '@/pages/ReportPage';
import AccountsPage from '@/pages/AccountsPage';
import BudgetsPage from '@/pages/BudgetsPage';
import SettingsPage from '@/pages/SettingsPage';

// HashRouter-backed routes (createHashRouter, not BrowserRouter): the app
// is loaded from a static file:// bundle on both Electron and Capacitor's
// iOS WKWebView, where there's no server to rewrite history-API paths.
// Hash routing works identically across web, macOS, and iOS with zero
// server configuration.
export const router = createHashRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <TransactionsPage /> },
      { path: 'report', element: <ReportPage /> },
      { path: 'accounts', element: <AccountsPage /> },
      { path: 'budgets', element: <BudgetsPage /> },
      { path: 'settings', element: <SettingsPage /> }
    ]
  }
]);
