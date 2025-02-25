let io;

export const initIO = (socketIO) => {
  io = socketIO;
};

export const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized');
  }
  return io;
};

export default {
  initIO,
  getIO
}; 