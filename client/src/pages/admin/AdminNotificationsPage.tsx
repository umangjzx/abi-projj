// The notification list, mutations, and empty state are identical for
// customers and admins -- the backend already scopes the query by role
// (personal notifications plus anything broadcast to ADMIN). Reusing the
// same component avoids maintaining two copies of the same markup.
export { default } from '../account/NotificationsPage';
