import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { StoreLayout } from './components/layout/StoreLayout';
import { AdminLayout } from './components/admin/AdminLayout';
import { AccountLayout } from './components/account/AccountLayout';
import { RequireAdmin, RequireAuth, RedirectIfAuthenticated } from './components/RouteGuards';
import { PageLoader } from './components/ui/feedback';
import { ErrorBoundary } from './components/ErrorBoundary';
import { TooltipProvider } from './components/ui/primitives';

// Eagerly loaded: the storefront entry points most visitors hit first.
import HomePage from './pages/store/HomePage';
import ProductListPage from './pages/store/ProductListPage';
import ProductDetailPage from './pages/store/ProductDetailPage';

/**
 * Everything else is code-split. The admin panel in particular pulls in Recharts
 * and would otherwise dominate the bundle a customer downloads.
 */
const CartPage = lazy(() => import('./pages/store/CartPage'));
const CheckoutPage = lazy(() => import('./pages/store/CheckoutPage'));
const OrderSuccessPage = lazy(() => import('./pages/store/OrderSuccessPage'));
const OffersPage = lazy(() => import('./pages/store/OffersPage'));
const ComparePage = lazy(() => import('./pages/store/ComparePage'));
const AboutPage = lazy(() => import('./pages/store/AboutPage'));

const LoginPage = lazy(() => import('./pages/auth/LoginPage'));
const RegisterPage = lazy(() => import('./pages/auth/RegisterPage'));
const VerifyEmailPage = lazy(() => import('./pages/auth/VerifyEmailPage'));
const ForgotPasswordPage = lazy(() => import('./pages/auth/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./pages/auth/ResetPasswordPage'));

const CustomerDashboard = lazy(() => import('./pages/account/CustomerDashboard'));
const OrdersPage = lazy(() => import('./pages/account/OrdersPage'));
const OrderDetailPage = lazy(() => import('./pages/account/OrderDetailPage'));
const WishlistPage = lazy(() => import('./pages/account/WishlistPage'));
const ProfilePage = lazy(() => import('./pages/account/ProfilePage'));
const MyReviewsPage = lazy(() => import('./pages/account/MyReviewsPage'));
const NotificationsPage = lazy(() => import('./pages/account/NotificationsPage'));

const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const MarketAnalysisPage = lazy(() => import('./pages/admin/MarketAnalysisPage'));
const AdminProductsPage = lazy(() => import('./pages/admin/AdminProductsPage'));
const ProductFormPage = lazy(() => import('./pages/admin/ProductFormPage'));
const AdminCategoriesPage = lazy(() => import('./pages/admin/AdminCategoriesPage'));
const AdminOrdersPage = lazy(() => import('./pages/admin/AdminOrdersPage'));
const AdminOrderDetailPage = lazy(() => import('./pages/admin/AdminOrderDetailPage'));
const AdminCustomersPage = lazy(() => import('./pages/admin/AdminCustomersPage'));
const AdminCustomerDetailPage = lazy(() => import('./pages/admin/AdminCustomerDetailPage'));
const AdminInventoryPage = lazy(() => import('./pages/admin/AdminInventoryPage'));
const AdminOffersPage = lazy(() => import('./pages/admin/AdminOffersPage'));
const AdminCouponsPage = lazy(() => import('./pages/admin/AdminCouponsPage'));
const AdminRecommendationsPage = lazy(() => import('./pages/admin/AdminRecommendationsPage'));
const AdminReportsPage = lazy(() => import('./pages/admin/AdminReportsPage'));
const AdminActivityPage = lazy(() => import('./pages/admin/AdminActivityPage'));
const AdminNotificationsPage = lazy(() => import('./pages/admin/AdminNotificationsPage'));

const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

export default function App() {
  return (
    <TooltipProvider delayDuration={250}>
      <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* ------------------------------------------------ storefront --- */}
            <Route element={<StoreLayout />}>
              <Route index element={<HomePage />} />
              <Route path="products" element={<ProductListPage />} />
              <Route path="products/:slug" element={<ProductDetailPage />} />
              <Route path="offers" element={<OffersPage />} />
              <Route path="compare" element={<ComparePage />} />
              <Route path="about" element={<AboutPage />} />
              <Route path="cart" element={<CartPage />} />

              <Route
                path="checkout"
                element={
                  <RequireAuth>
                    <CheckoutPage />
                  </RequireAuth>
                }
              />
              <Route
                path="order-confirmed/:id"
                element={
                  <RequireAuth>
                    <OrderSuccessPage />
                  </RequireAuth>
                }
              />

              {/* --------------------------------------- customer account --- */}
              <Route
                path="account"
                element={
                  <RequireAuth>
                    <AccountLayout />
                  </RequireAuth>
                }
              >
                <Route index element={<CustomerDashboard />} />
                <Route path="orders" element={<OrdersPage />} />
                <Route path="orders/:id" element={<OrderDetailPage />} />
                <Route path="wishlist" element={<WishlistPage />} />
                <Route path="reviews" element={<MyReviewsPage />} />
                <Route path="notifications" element={<NotificationsPage />} />
                <Route path="profile" element={<ProfilePage />} />
              </Route>
            </Route>

            {/* ----------------------------------------------------- auth --- */}
            <Route
              path="/login"
              element={
                <RedirectIfAuthenticated>
                  <LoginPage />
                </RedirectIfAuthenticated>
              }
            />
            <Route
              path="/register"
              element={
                <RedirectIfAuthenticated>
                  <RegisterPage />
                </RedirectIfAuthenticated>
              }
            />
            <Route path="/verify-email" element={<VerifyEmailPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />

            {/* ---------------------------------------------------- admin --- */}
            <Route
              path="/admin"
              element={
                <RequireAdmin>
                  <AdminLayout />
                </RequireAdmin>
              }
            >
              <Route index element={<AdminDashboard />} />
              <Route path="analytics" element={<MarketAnalysisPage />} />
              <Route path="products" element={<AdminProductsPage />} />
              <Route path="products/new" element={<ProductFormPage />} />
              <Route path="products/:id/edit" element={<ProductFormPage />} />
              <Route path="categories" element={<AdminCategoriesPage />} />
              <Route path="orders" element={<AdminOrdersPage />} />
              <Route path="orders/:id" element={<AdminOrderDetailPage />} />
              <Route path="customers" element={<AdminCustomersPage />} />
              <Route path="customers/:id" element={<AdminCustomerDetailPage />} />
              <Route path="inventory" element={<AdminInventoryPage />} />
              <Route path="offers" element={<AdminOffersPage />} />
              <Route path="coupons" element={<AdminCouponsPage />} />
              <Route path="recommendations" element={<AdminRecommendationsPage />} />
              <Route path="reports" element={<AdminReportsPage />} />
              <Route path="activity" element={<AdminActivityPage />} />
              <Route path="notifications" element={<AdminNotificationsPage />} />
            </Route>

            {/* Legacy/typo-friendly aliases */}
            <Route path="/shop" element={<Navigate to="/products" replace />} />
            <Route path="/signin" element={<Navigate to="/login" replace />} />
            <Route path="/signup" element={<Navigate to="/register" replace />} />

            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </TooltipProvider>
  );
}
