import { Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { AppLayout } from '@/layouts/AppLayout';
import ChangePasswordPage from '@/pages/auth/ChangePasswordPage';
import LoginPage from '@/pages/auth/LoginPage';
import SelectContextPage from '@/pages/auth/SelectContextPage';
import ForbiddenPage from '@/pages/system/ForbiddenPage';
import HomePage from '@/pages/system/HomePage';
import NotFoundPage from '@/pages/system/NotFoundPage';
import { RequireAuth, RequireContext, RequireMenuAccess, RequirePasswordChanged } from './guards';
import { pageRoutes } from './registry';

export function AppRouter() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Suspense fallback={<FullPageSpinner />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/403" element={<ForbiddenPage />} />
          <Route path="/404" element={<NotFoundPage />} />

          <Route element={<RequireAuth />}>
            <Route path="/change-password" element={<ChangePasswordPage />} />

            <Route element={<RequirePasswordChanged />}>
              <Route path="/select-context" element={<SelectContextPage />} />

              <Route element={<RequireContext />}>
                <Route element={<AppLayout />}>
                  <Route index element={<HomePage />} />
                  {pageRoutes.map(({ path, menuCode, component: Page }) => (
                    <Route
                      key={path}
                      path={path}
                      element={
                        <RequireMenuAccess menuCode={menuCode}>
                          <Page />
                        </RequireMenuAccess>
                      }
                    />
                  ))}
                  <Route path="*" element={<NotFoundPage embedded />} />
                </Route>
              </Route>
            </Route>
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
