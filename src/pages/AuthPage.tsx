import React, { useState } from 'react';
import Login from '../components/Login';
import Register from '../components/Register';

const AuthPage = () => {
  const [isLogin, setIsLogin] = useState(true);

  const toggleForm = () => setIsLogin(!isLogin);

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col justify-center items-center p-4">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-extrabold text-gray-900">Task Management App</h1>
        <p className="text-lg text-gray-600 mt-2">
          {isLogin ? 'Sign in to your account' : 'Create a new account'}
        </p>
      </div>
      
      {isLogin ? <Login /> : <Register />}

      <div className="mt-4 text-center">
        <button onClick={toggleForm} className="text-sm text-blue-500 hover:text-blue-800 focus:outline-none">
          {isLogin ? "Don't have an account? Register" : 'Already have an account? Sign In'}
        </button>
      </div>
    </div>
  );
};

export default AuthPage;