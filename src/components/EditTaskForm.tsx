import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { API_URL } from '../apiConfig';
import type { Task } from '../interfaces';

interface EditTaskFormProps {
  task: Task;
  onClose: () => void;
  onTasksUpdated: () => void;
}

const EditTaskForm: React.FC<EditTaskFormProps> = ({ task, onClose, onTasksUpdated }) => {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || '');

  // Helper to format date for datetime-local input, which expects 'YYYY-MM-DDTHH:mm'
  const formatDateTimeForInput = (dateString: string | null) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      // Adjust for timezone offset to display the correct local time
      const timezoneOffset = date.getTimezoneOffset() * 60000;
      const localDate = new Date(date.getTime() - timezoneOffset);
      return localDate.toISOString().slice(0, 16);
    } catch (e) {
      return '';
    }
  };

  const [dueDate, setDueDate] = useState(formatDateTimeForInput(task.due_date));

  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description || '');
    setDueDate(formatDateTimeForInput(task.due_date));
  }, [task]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem('token');
    if (!token) {
      toast.error('You must be logged in to edit tasks.');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/tasks/${task.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ title, description, due_date: dueDate || null }),
      });

      if (response.ok) {
        toast.success('Task updated successfully!');
        onTasksUpdated();
        onClose();
      } else {
        const data = await response.json();
        toast.error(data.message || 'Failed to update task.');
      }
    } catch (error) {
      toast.error('Failed to connect to the server.');
      console.error('Update task error:', error);
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Edit Task</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="edit-title">Title</label>
          <input className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700" id="edit-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>
        <div>
          <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="edit-description">Description</label>
          <textarea className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 h-24" id="edit-description" value={description} onChange={(e) => setDescription(e.target.value)}></textarea>
        </div>
        <div>
          <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="edit-due-date">Due Date</label>
          <input className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700" id="edit-due-date" type="datetime-local" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <div className="flex items-center justify-end space-x-4 pt-4">
          <button type="button" onClick={onClose} className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline">Cancel</button>
          <button type="submit" className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline">Save Changes</button>
        </div>
      </form>
    </div>
  );
};

export default EditTaskForm;