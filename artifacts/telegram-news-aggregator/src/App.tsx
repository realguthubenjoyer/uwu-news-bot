import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useGetConnection } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { RelayShell } from '@/components/relay-shell';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import ConnectionPage from '@/pages/connection';
import DashboardPage from '@/pages/dashboard';
import NotFound from '@/pages/not-found';
import RulesPage from '@/pages/rules';
import SourcesPage from '@/pages/sources';
import {
  Route,
  Switch,
  Router as WouterRouter,
  useLocation,
} from 'wouter';

const queryClient = new QueryClient();

function Router() {
  const connection = useGetConnection();
  return (
    <RoutedErrorBoundary>
      <RelayShell connection={connection.data}>
        <Switch>
          <Route path="/" component={DashboardPage} />
          <Route path="/sources" component={SourcesPage} />
          <Route path="/rules" component={RulesPage} />
          <Route path="/connection" component={ConnectionPage} />
          <Route component={NotFound} />
        </Switch>
      </RelayShell>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
