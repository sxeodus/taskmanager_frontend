import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';

const ProtectedRoute = () => {
  const token = localStorage.getItem('token');

  // If there's a token, render the child routes, otherwise redirect to login.
  // The <Outlet /> component will render the matched child route element.
  return token ? <Outlet /> : <Navigate to="/" replace />;
};

export default ProtectedRoute;