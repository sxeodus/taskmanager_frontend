import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import TaskForm from '../components/TaskForm';
import TaskList from '../components/TaskList';
import { io, type Socket } from 'socket.io-client';
import { API_URL } from '../apiConfig';
import { toast } from 'react-toastify';

const DashboardPage = () => {
  const navigate = useNavigate();
  // State to trigger task list refresh
  const [refreshTasks, setRefreshTasks] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');
  const [sortBy, setSortBy] = useState('order_asc');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');

  // State for pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Debounce search term so we don't call the API on every keystroke
  useEffect(() => {
    const timerId = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      setCurrentPage(1); // Reset to page 1 on new search
    }, 500); // 500ms delay

    return () => {
      clearTimeout(timerId);
    };
  }, [searchTerm]);

  const handleTasksUpdated = useCallback(() => {
    // We always want to refresh, and it's safest to go back to page 1
    // as the number of pages might have changed.
    setCurrentPage(prevPage => (prevPage !== 1 ? 1 : prevPage));
    setRefreshTasks(prev => !prev);
  }, []);

  // Socket.IO real-time updates
  useEffect(() => {
    // Connect to the WebSocket server
    const socket: Socket = io(API_URL);

    socket.on('connect', () => {
      console.log('Connected to WebSocket server with id:', socket.id);
      // Authenticate the socket connection
      const token = localStorage.getItem('token');
      if (token) {
        socket.emit('authenticate', token);
      }
    });

    // Listen for the 'tasks_updated' event
    socket.on('tasks_updated', () => {
      console.log('Received tasks_updated event. Refreshing task list.');
      toast.info('Task list updated automatically.', { autoClose: 2000 });
      handleTasksUpdated();
    });

    // Listen for the 'task_due_soon' event
    socket.on('task_due_soon', (task: { title: string; due_date: string }) => {
      const dueDate = new Date(task.due_date);
      toast.warn(
        `Task due soon: "${task.title}" is due on ${dueDate.toLocaleString()}`,
        {
          autoClose: 10000, // Keep the toast for 10 seconds
          position: "top-right",
        }
      );
    });

    // Cleanup on component unmount
    return () => {
      console.log('Disconnecting WebSocket.');
      socket.disconnect();
    };
  }, [handleTasksUpdated]);

  const handleLogout = () => {
    // Clear the token from local storage
    localStorage.removeItem('token');
    // Redirect to the login page
    navigate('/');
  };

  const handlePageDataLoaded = useCallback((data: { totalPages: number }) => {
    setTotalPages(data.totalPages);
  }, []);

  const handleFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilterStatus(e.target.value);
    setCurrentPage(1); // Reset page on filter change
  };

  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSortBy(e.target.value);
    setCurrentPage(1); // Reset page on sort change
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-8 px-4">
      <div className="w-full max-w-3xl p-8 space-y-6 bg-white rounded-xl shadow-lg text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-800">Welcome to your Dashboard!</h1>
        <p className="text-lg text-gray-700">You are successfully logged in.</p>
        <button
          onClick={handleLogout}
          className="mt-6 px-6 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
        >
          Logout
        </button>
      </div>
      <TaskForm onTasksUpdated={handleTasksUpdated} />
      <div className="mt-8 w-full max-w-3xl">
        <div className="flex flex-col sm:flex-row justify-between items-center mb-4 p-4 bg-gray-100 rounded-lg shadow-sm gap-4">
            <div className="w-full sm:w-auto sm:flex-grow">
                <input
                    type="search"
                    placeholder="Search tasks by title or description..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="p-2 border rounded-md bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm w-full"
                />
            </div>
            <div className="flex flex-col sm:flex-row items-center space-y-2 sm:space-y-0 sm:space-x-4">
                <div>
                    <label htmlFor="filter" className="text-sm font-medium text-gray-600 mr-2">Filter:</label>
                    <select
                        id="filter"
                        value={filterStatus}
                        onChange={handleFilterChange}
                        className="p-2 border rounded-md bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    >
                        <option value="all">All</option>
                        <option value="pending">Pending</option>
                        <option value="in_progress">In Progress</option>
                        <option value="completed">Completed</option>
                    </select>
                </div>
                <div>
                    <label htmlFor="sort" className="text-sm font-medium text-gray-600 mr-2">Sort:</label>
                    <select
                        id="sort"
                        value={sortBy}
                        onChange={handleSortChange}
                        className="p-2 border rounded-md bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    >
                        <option value="order_asc">Custom Order</option>
                        <option value="createdAt_desc">Newest First</option>
                        <option value="createdAt_asc">Oldest First</option>
                        <option value="dueDate_asc">Due Date (Asc)</option>
                        <option value="dueDate_desc">Due Date (Desc)</option>
                    </select>
                </div>
            </div>
        </div>
        <TaskList
            refreshTrigger={refreshTasks}
            onTasksUpdated={handleTasksUpdated}
            filterStatus={filterStatus}
            sortBy={sortBy}
            currentPage={currentPage}
            onPageDataLoaded={handlePageDataLoaded}
            searchTerm={debouncedSearchTerm}
        />
        {totalPages > 1 && (
          <div className="flex justify-center items-center space-x-4 mt-6">
            <button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="text-gray-700 font-medium">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default DashboardPage;
