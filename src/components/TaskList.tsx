import React, { useState, useEffect } from 'react';
import type { Task } from '../interfaces';
import { toast } from 'react-toastify';
import Modal from './Modal';
import EditTaskForm from './EditTaskForm';
import { DragDropContext, Draggable, type DropResult } from 'react-beautiful-dnd';
import { StrictDroppable } from './StrictDroppable';
import { API_URL } from '../apiConfig';

interface PaginatedTasksResponse {
  tasks: Task[];
  totalPages: number;
  currentPage: number;
}

interface TaskListProps {
  refreshTrigger: boolean;
  onTasksUpdated: () => void;
  filterStatus: string;
  sortBy: string;
  currentPage: number;
  onPageDataLoaded: (data: { totalPages: number }) => void;
  searchTerm: string;
}

const TaskList: React.FC<TaskListProps> = ({ refreshTrigger, onTasksUpdated, filterStatus, sortBy, currentPage, onPageDataLoaded, searchTerm }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleStatusChange = async (taskId: number, newStatus: string) => {
    const token = localStorage.getItem('token');
    if (!token) {
      toast.error('You must be logged in to update tasks.');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to update task status.');
      }

      // Refresh the list to show the change
      onTasksUpdated();
      toast.success('Task status updated!');
    } catch (err: any) {
      toast.error(err.message || 'An error occurred while updating the task.');
    }
  };

  const handleDelete = async (taskId: number) => {
    if (!window.confirm('Are you sure you want to delete this task?')) {
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      toast.error('You must be logged in to delete tasks.');
      return;
    }

    try {
      await fetch(`${API_URL}/api/tasks/${taskId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      onTasksUpdated();
      toast.success('Task deleted successfully.');
    } catch (err: any) {
      toast.error(err.message || 'An error occurred while deleting the task.');
    }
  };

  const handleOpenEditModal = (task: Task) => {
    setEditingTask(task);
    setIsModalOpen(true);
  };

  const onDragEnd = async (result: DropResult) => {
    const { destination, source } = result;

    if (!destination || (destination.droppableId === source.droppableId && destination.index === source.index)) {
      return;
    }

    const originalTasks = Array.from(tasks);
    const [removed] = originalTasks.splice(source.index, 1);
    originalTasks.splice(destination.index, 0, removed);

    setTasks(originalTasks);

    const orderedIds = originalTasks.map(task => task.id);
    const token = localStorage.getItem('token');

    try {
      const response = await fetch(`${API_URL}/api/tasks/reorder`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ orderedIds, page: currentPage }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to reorder tasks.');
      }
    } catch (error: any) {
      toast.error(error.message || 'Could not save new order. Reverting.');
      // Revert UI on failure by re-fetching
      onTasksUpdated();
      console.error('Reorder task error:', error);
    }
  };

  useEffect(() => {
    const fetchTasks = async () => {
      setIsLoading(true);
      const token = localStorage.getItem('token');
      if (!token) {
        setError("Authentication error. Please log in again.");
        setIsLoading(false);
        return;
      }

      const params = new URLSearchParams({
          status: filterStatus,
          sortBy: sortBy,
          page: String(currentPage),
          limit: '10',
      });

      if (searchTerm) {
        params.append('search', searchTerm);
      }

      try {
        const response = await fetch(`${API_URL}/api/tasks?${params.toString()}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          if (response.status === 401) {
            setError("Your session has expired. Please log in again.");
          } else {
            const data = await response.json();
            throw new Error(data.message || 'Failed to fetch tasks');
          }
          // Clear data on error
          setTasks([]);
          onPageDataLoaded({ totalPages: 1 });
          return;
        }
        const data: PaginatedTasksResponse = await response.json();
        setTasks(data.tasks);
        onPageDataLoaded({ totalPages: data.totalPages });
        setError(null);
      } catch (err: any) {
        setError(err.message || 'An error occurred while fetching tasks.');
        setTasks([]); // Clear tasks on error
        onPageDataLoaded({ totalPages: 1 }); // Reset pagination on error
      } finally {
        setIsLoading(false);
      }
    };

    fetchTasks();
  }, [refreshTrigger, filterStatus, sortBy, currentPage, onPageDataLoaded, searchTerm]);

  if (isLoading) {
    return <p className="text-center text-gray-500">Loading tasks...</p>;
  }

  if (error) {
    return <p className="text-center text-red-500">{error}</p>;
  }

  const isDragDisabled = sortBy !== 'order_asc';

  return (
    <>
      <DragDropContext onDragEnd={onDragEnd}>
        {tasks.length === 0 && currentPage === 1 ? (
          <p className="text-center text-gray-600 p-4 bg-gray-50 rounded-md">No tasks match the current filter. Try adding one!</p>
        ) : tasks.length === 0 && currentPage > 1 ? (
          <p className="text-center text-gray-600 p-4 bg-gray-50 rounded-md">No tasks on this page.</p>
        ) : (
          <StrictDroppable droppableId="tasks" isDropDisabled={isDragDisabled}>
            {(provided) => (
              <ul className="space-y-4" {...provided.droppableProps} ref={provided.innerRef}>
                {tasks.map((task, index) => {
                  const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'completed';
                  return (
                    <Draggable key={task.id} draggableId={String(task.id)} index={index} isDragDisabled={isDragDisabled}>
                      {(provided, snapshot) => (
                        <li
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                          className={`p-4 border rounded-lg shadow-sm flex justify-between items-start transition-all duration-200 ${isOverdue ? 'bg-red-50 border-red-400' : 'bg-gray-50'} ${snapshot.isDragging ? 'shadow-xl bg-blue-50 ring-2 ring-blue-400' : ''} ${isDragDisabled ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'}`}
                        >
                          <div className="flex-grow pr-4">
                            <h3 className="font-bold text-lg text-gray-800 break-words">{task.title}</h3>
                            {task.description && <p className="text-gray-600 mt-2 text-sm break-words">{task.description}</p>}
                            <div className="text-xs text-gray-500 mt-3 space-y-1">
                              <p>Created: <span className="font-medium">{new Date(task.created_at).toLocaleString()}</span></p>
                              {task.due_date && (
                                <p className={`font-semibold ${isOverdue ? 'text-red-600' : 'text-blue-600'}`}>
                                  Due: {new Date(task.due_date).toLocaleString()}
                                  {isOverdue && <span className="ml-2 font-bold uppercase">(Overdue)</span>}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col items-end space-y-3 ml-4 flex-shrink-0 w-36">
                            <select
                              value={task.status}
                              onChange={(e) => handleStatusChange(task.id, e.target.value)}
                              className="p-1 border rounded-md bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm w-full"
                            >
                              <option value="pending">Pending</option>
                              <option value="in_progress">In Progress</option>
                              <option value="completed">Completed</option>
                            </select>
                            <div className="flex space-x-2">
                              <button onClick={() => handleOpenEditModal(task)} className="text-blue-500 hover:text-blue-700" title="Edit Task">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                  <path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" />
                                  <path fillRule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" />
                                </svg>
                              </button>
                              <button onClick={() => handleDelete(task.id)} className="text-red-500 hover:text-red-700" title="Delete Task">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        </li>
                      )}
                    </Draggable>
                  );
                })}
                {provided.placeholder}
              </ul>
            )}
          </StrictDroppable>
        )}
      </DragDropContext>
      {editingTask && (
        <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}>
          <EditTaskForm
            task={editingTask}
            onClose={() => setIsModalOpen(false)}
            onTasksUpdated={() => {
              setIsModalOpen(false);
              onTasksUpdated();
            }}
          />
        </Modal>
      )}
    </>
  );
};

export default TaskList;
