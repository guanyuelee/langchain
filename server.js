// 导入必要的依赖
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { OpenAI } = require('langchain/llms/openai');
const { BufferMemory } = require('langchain/memory');
const { ConversationChain } = require('langchain/chains');
require('dotenv').config();

// 创建Express应用
const app = express();
const httpServer = createServer(app);

// 配置Socket.IO
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// 配置静态文件服务
app.use(express.static('public'));

// 初始化OpenAI模型
const model = new OpenAI({
  temperature: 0.7,
  apiKey: process.env.OPENAI_API_KEY
});

// 为每个客户端创建一个会话记忆
const userSessions = new Map();

// Socket.IO事件处理
io.on('connection', (socket) => {
  console.log(`用户 ${socket.id} 已连接`);

  // 为新用户创建会话链
  socket.on('join', () => {
    const memory = new BufferMemory({
      returnMessages: true,
      memoryKey: 'chat_history'
    });
    
    const chain = new ConversationChain({
      llm: model,
      memory: memory
    });

    userSessions.set(socket.id, chain);
    socket.emit('bot_response', '你好！我是基于LangChain的聊天机器人。请问有什么我可以帮助你的吗？');
  });

  // 处理用户消息
  socket.on('user_message', async (message) => {
    try {
      const chain = userSessions.get(socket.id);
      
      if (!chain) {
        socket.emit('bot_response', '请先建立连接');
        return;
      }

      // 使用LangChain处理消息
      const response = await chain.call({
        input: message
      });

      // 发送回复给客户端
      socket.emit('bot_response', response.response);
    } catch (error) {
      console.error('处理消息时出错:', error);
      socket.emit('bot_response', '抱歉，处理您的请求时出现了错误。');
    }
  });

  // 处理断开连接
  socket.on('disconnect', () => {
    console.log(`用户 ${socket.id} 已断开连接`);
    userSessions.delete(socket.id);
  });
});

// 启动服务器
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
});