import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import AccountSettings from './pages/AccountSettings';
import CandidateDetail from './pages/CandidateDetail';
import CompaniesBrowse from './pages/CompaniesBrowse';
import CompanyConsole from './pages/CompanyConsole';
import CompanyDetail from './pages/CompanyDetail';
import CompanyManage from './pages/CompanyManage';
import Forbidden from './pages/Forbidden';
import Home from './pages/Home';
import NotFound from './pages/NotFound';
import ServerError from './pages/ServerError';
import JobDetail from './pages/JobDetail';
import JobManage from './pages/JobManage';
import JobsBrowse from './pages/JobsBrowse';
import Login from './pages/Login';
import Messages from './pages/Messages';
import MyApplications from './pages/MyApplications';
import Notifications from './pages/Notifications';
import Recommendations from './pages/Recommendations';
import Register from './pages/Register';
import SeekerProfile from './pages/SeekerProfile';
import Shortlist from './pages/Shortlist';
import TalentSearch from './pages/TalentSearch';
import VerifyEmail from './pages/VerifyEmail';

export default function App(): JSX.Element {
  return (
    <Layout>
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
    </Layout>
  );
}
