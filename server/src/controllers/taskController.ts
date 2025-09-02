import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import pool from '../db';
import { Server } from 'socket.io';

// Helper to get the next order value
async function getNextTaskOrder(userId: number): Promise<number> {
  const [rows] = await pool.execute(
    'SELECT MAX(`order`) as maxOrder FROM tasks WHERE user_id = ?',
    [userId]
  );
  const { maxOrder } = (rows as any[])[0];
  return maxOrder === null ? 0 : maxOrder + 1;
}

export const createTask = (io: Server) => async (req: AuthRequest, res: Response) => {
  const { title, description, due_date } = req.body;
  const userId = req.user?.userId;

  if (!title) return res.status(400).json({ message: 'Title is required' });

  const dueDateValue = due_date ? new Date(due_date) : null;
  if (dueDateValue && isNaN(dueDateValue.getTime())) {
    return res.status(400).json({ message: 'Invalid due date format' });
  }

  try {
    const nextOrder = await getNextTaskOrder(userId!);
    const [result] = await pool.execute(
      'INSERT INTO tasks (user_id, title, description, due_date, `order`) VALUES (?, ?, ?, ?, ?)',
      [userId, title, description || null, dueDateValue, nextOrder]
    );
    const insertResult = result as any;
    io.emit('tasks_updated');
    res.status(201).json({ id: insertResult.insertId, title, description, status: 'pending', due_date: dueDateValue, order: nextOrder });
  } catch (error) {
    console.error('Task creation error:', error);
    res.status(500).json({ message: 'Server error during task creation' });
  }
};

export const getTasks = async (req: AuthRequest, res: Response) => {
  const { status, sortBy, page = '1', limit = '10', search } = req.query;
  const userId = req.user?.userId;
  const pageNum = parseInt(page as string, 10);
  const limitNum = parseInt(limit as string, 10);

  if (isNaN(pageNum) || isNaN(limitNum) || pageNum < 1 || limitNum < 1) {
    return res.status(400).json({ message: 'Invalid pagination parameters.' });
  }

  const offset = (pageNum - 1) * limitNum;
  let countQuery = 'SELECT COUNT(*) as total FROM tasks WHERE user_id = ?';
  let dataQuery = 'SELECT id, title, description, status, created_at, due_date, `order` FROM tasks WHERE user_id = ?';
  const queryParams: (string | number | null)[] = [userId!];

  if (status && status !== 'all') {
    const filterClause = ' AND status = ?';
    dataQuery += filterClause;
    countQuery += filterClause;
    queryParams.push(status as string);
  }

  if (search && typeof search === 'string' && search.trim() !== '') {
    const searchQuery = ` AND (title LIKE ? OR description LIKE ?)`;
    dataQuery += searchQuery;
    countQuery += searchQuery;
    const searchTerm = `%${search.trim()}%`;
    queryParams.push(searchTerm, searchTerm);
  }

  const sortOptions: { [key: string]: string } = {
    order_asc: '`order` ASC',
    createdAt_desc: 'created_at DESC, `order` ASC',
    createdAt_asc: 'created_at ASC, `order` ASC',
    dueDate_desc: 'due_date DESC, `order` ASC',
    dueDate_asc: 'due_date ASC, `order` ASC',
  };

  let orderBy = 'ORDER BY `order` ASC';
  if (sortBy && typeof sortBy === 'string' && sortOptions[sortBy]) {
    orderBy = `ORDER BY ${sortOptions[sortBy]}`;
  }
  dataQuery += ` ${orderBy} LIMIT ${limitNum} OFFSET ${offset}`;

  try {
    const [countResult] = await pool.execute(countQuery, queryParams) as any[];
    const total = countResult[0]?.total || 0;
    const [rows] = await pool.execute(dataQuery, queryParams);
    const totalPages = Math.ceil(total / limitNum);
    res.json({
      tasks: rows,
      totalPages: totalPages > 0 ? totalPages : 1,
      currentPage: pageNum,
    });
  } catch (error) {
    console.error('Fetch tasks error:', error);
    res.status(500).json({ message: 'Server error while fetching tasks' });
  }
};

export const reorderTasks = (io: Server) => async (req: AuthRequest, res: Response) => {
    const { orderedIds, page } = req.body;
    const userId = req.user?.userId;
    const pageNum = parseInt(page, 10);
    if (isNaN(pageNum) || pageNum < 1) return res.status(400).json({ message: 'A valid page number is required.' });
    if (!Array.isArray(orderedIds)) return res.status(400).json({ message: 'An array of ordered task IDs is required.' });
    if (orderedIds.length === 0) return res.status(200).json({ message: 'No tasks to reorder.' });

    const limit = 10;
    const offset = (pageNum - 1) * limit;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const updatePromises = orderedIds.map((id, index) => {
            const newOrder = offset + index;
            return connection.execute('UPDATE tasks SET `order` = ? WHERE id = ? AND user_id = ?', [newOrder, id, userId]);
        });
        await Promise.all(updatePromises);
        await connection.commit();
        io.emit('tasks_updated');
        res.status(200).json({ message: 'Tasks reordered successfully.' });
    } catch (error) {
        await connection.rollback();
        console.error('Task reorder error:', error);
        res.status(500).json({ message: 'Server error during task reorder.' });
    } finally {
        connection.release();
    }
};

export const updateTaskStatus = (io: Server) => async (req: AuthRequest, res: Response) => {
    const { status } = req.body;
    const taskId = req.params.id;
    const userId = req.user?.userId;

    if (!status || !['pending', 'in_progress', 'completed'].includes(status)) {
        return res.status(400).json({ message: 'A valid status is required' });
    }

    try {
        const [result] = await pool.execute('UPDATE tasks SET status = ? WHERE id = ? AND user_id = ?', [status, taskId, userId]);
        const updateResult = result as any;
        if (updateResult.affectedRows === 0) return res.status(404).json({ message: 'Task not found or user not authorized' });
        io.emit('tasks_updated');
        res.json({ message: 'Task status updated successfully' });
    } catch (error) {
        console.error('Task update error:', error);
        res.status(500).json({ message: 'Server error during task update' });
    }
};

export const deleteTask = (io: Server) => async (req: AuthRequest, res: Response) => {
    const taskId = req.params.id;
    const userId = req.user?.userId;
    try {
        const [result] = await pool.execute('DELETE FROM tasks WHERE id = ? AND user_id = ?', [taskId, userId]);
        const deleteResult = result as any;
        if (deleteResult.affectedRows === 0) return res.status(404).json({ message: 'Task not found or user not authorized' });
        io.emit('tasks_updated');
        res.status(200).json({ message: 'Task deleted successfully' });
    } catch (error) {
        console.error('Task deletion error:', error);
        res.status(500).json({ message: 'Server error during task deletion.' });
    }
};

export const updateTask = (io: Server) => async (req: AuthRequest, res: Response) => {
    const { title, description, due_date } = req.body;
    const taskId = req.params.id;
    const userId = req.user?.userId;

    if (!title) return res.status(400).json({ message: 'Title is required' });

    const dueDateValue = due_date ? new Date(due_date) : null;
    if (dueDateValue && isNaN(dueDateValue.getTime())) {
        return res.status(400).json({ message: 'Invalid due date format' });
    }

    try {
        const [result] = await pool.execute(
            'UPDATE tasks SET title = ?, description = ?, due_date = ?, notification_sent = FALSE WHERE id = ? AND user_id = ?',
            [title, description || null, dueDateValue, taskId, userId]
        );
        const updateResult = result as any;
        if (updateResult.affectedRows === 0) return res.status(404).json({ message: 'Task not found or user not authorized' });
        io.emit('tasks_updated');
        res.json({ message: 'Task updated successfully' });
    } catch (error) {
        console.error('Task update error:', error);
        res.status(500).json({ message: 'Server error during task update' });
    }
};
