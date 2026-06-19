import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Loading } from './design';
// Status pages are tiny and used by the error boundary — keep them eager.
import Forbidden from './pages/Forbidden';
import NotFound from './pages/NotFound';
import ServerError from './pages/ServerError';

// Route-level code splitting (UI-6): each feature page is its own chunk.
const Home = lazy(() => import('./pages/Home'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'));
const JobsBrowse = lazy(() => import('./pages/JobsBrowse'));
const JobDetail = lazy(() => import('./pages/JobDetail'));
const CompaniesBrowse = lazy(() => import('./pages/CompaniesBrowse'));
const CompanyDetail = lazy(() => import('./pages/CompanyDetail'));
const AccountSettings = lazy(() => import('./pages/AccountSettings'));
const Messages = lazy(() => import('./pages/Messages'));
const Notifications = lazy(() => import('./pages/Notifications'));
const SeekerProfile = lazy(() => import('./pages/SeekerProfile'));
const Recommendations = lazy(() => import('./pages/Recommendations'));
const MyApplications = lazy(() => import('./pages/MyApplications'));
const CompanyConsole = lazy(() => import('./pages/CompanyConsole'));
const CompanyManage = lazy(() => import('./pages/CompanyManage'));
const JobManage = lazy(() => import('./pages/JobManage'));
const TalentSearch = lazy(() => import('./pages/TalentSearch'));
const CandidateDetail = lazy(() => import('./pages/CandidateDetail'));
const Shortlist = lazy(() => import('./pages/Shortlist'));

export default function App(): JSX.Element {
  return (
    <Layout>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/verify" element={<VerifyEmail />} />
          <Route path="/jobs" element={<JobsBrowse />} />
          <Route path="/jobs/:id" element={<JobDetail />} />
          <Route path="/companies" element={<CompaniesBrowse />} />
          <Route path="/companies/:id" element={<CompanyDetail />} />

          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <AccountSettings />
              </ProtectedRoute>
            }
          />
          <Route
            path="/messages"
            element={
              <ProtectedRoute>
                <Messages />
              </ProtectedRoute>
            }
          />
          <Route
            path="/notifications"
            element={
              <ProtectedRoute>
                <Notifications />
              </ProtectedRoute>
            }
          />

          <Route
            path="/me"
            element={
              <ProtectedRoute role="job_seeker">
                <SeekerProfile />
              </ProtectedRoute>
            }
          />
          <Route
            path="/recommendations"
            element={
              <ProtectedRoute role="job_seeker">
                <Recommendations />
              </ProtectedRoute>
            }
          />
          <Route
            path="/applications"
            element={
              <ProtectedRoute role="job_seeker">
                <MyApplications />
              </ProtectedRoute>
            }
          />

          <Route
            path="/console"
            element={
              <ProtectedRoute role="company_member">
                <CompanyConsole />
              </ProtectedRoute>
            }
          />
          <Route
            path="/console/companies/:id"
            element={
              <ProtectedRoute role="company_member">
                <CompanyManage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/console/jobs/:id"
            element={
              <ProtectedRoute role="company_member">
                <JobManage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/talent"
            element={
              <ProtectedRoute role="company_member">
                <TalentSearch />
              </ProtectedRoute>
            }
          />
          <Route
            path="/talent/:id"
            element={
              <ProtectedRoute role="company_member">
                <CandidateDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/shortlist"
            element={
              <ProtectedRoute role="company_member">
                <Shortlist />
              </ProtectedRoute>
            }
          />

          <Route path="/403" element={<Forbidden />} />
          <Route path="/500" element={<ServerError />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </Layout>
  );
}
