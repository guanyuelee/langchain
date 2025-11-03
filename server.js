// 导入必要的依赖
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const axios = require('axios');
require('dotenv').config();

// 使用LangChain简化API调用

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

// 存储用户会话历史
const userSessions = new Map();

// 阿里云百炼千问模型API调用函数 - 使用简化的格式
async function callAlibabaLLM(prompt, history = []) {
  try {
    // 构建简单的对话历史字符串
    let fullPrompt = '';
    if (history.length > 0) {
      history.forEach(item => {
        fullPrompt += `用户: ${item.user}\n助手: ${item.assistant}\n`;
      });
    }
    fullPrompt += `用户: ${prompt}\n助手:`;
    
    // 阿里云百炼千问API地址 - 使用OpenAI兼容格式
    const apiUrl = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
    
    // 构建消息格式
    let messages = [];
    if (history.length > 0) {
      history.forEach(item => {
        messages.push({ role: 'user', content: item.user });
        messages.push({ role: 'assistant', content: item.assistant });
      });
    }
    messages.push({ role: 'user', content: prompt });
    
    // 调用阿里云百炼千问API - 使用OpenAI兼容的chat completions格式
    const response = await axios.post(
      apiUrl,
      {
        model: 'qwen-plus',
        messages: messages,
        temperature: 0.7
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer sk-cd4d4c1e50194f43a0810a496af65a76'
        }
      }
    );

    // 处理OpenAI兼容格式的响应
    if (response.data && response.data.choices && response.data.choices.length > 0 && response.data.choices[0].message) {
      return response.data.choices[0].message.content;
    } else if (response.data && response.data.output && response.data.output.text) {
      return response.data.output.text;
    } else if (response.data && response.data.result) {
      return response.data.result;
    } else {
      console.log('完整响应:', JSON.stringify(response.data));
      throw new Error('响应格式不符合预期');
    }
  } catch (error) {
    console.error('阿里云百炼千问API调用错误详情:', error.response?.data || error.message);
    throw new Error(`阿里云百炼千问服务调用失败: ${error.message}`);
  }
}

// 处理Socket.IO连接
io.on('connection', (socket) => {
  console.log('新用户连接');
  
  // 为新用户初始化会话
  socket.on('join', () => {
    // 初始化空的会话历史
    userSessions.set(socket.id, []);
    socket.emit('bot_response', '你好！我是基于阿里云百炼千问的聊天机器人。请问有什么我可以帮助你的吗？');
  });

  // 处理用户消息
  socket.on('user_message', async (message) => {
    try {
      const history = userSessions.get(socket.id);
      if (!history) {
        socket.emit('bot_response', '请先建立连接');
        return;
      }
      
      // 标记正在思考
      socket.emit('typing', true);

      // 调用阿里云百炼千问API获取回复
      const response = await callAlibabaLLM(message, history);
      
      // 更新会话历史
      history.push({
        user: message,
        assistant: response
      });
      
      // 限制历史记录长度，避免过长
      if (history.length > 10) {
        history.shift(); // 移除最早的对话
      }

      // 标记思考结束
      socket.emit('typing', false);
      
      // 发送回复给客户端
      socket.emit('bot_response', response);
    } catch (error) {
      console.error('处理消息时出错:', error);
      socket.emit('typing', false);
      socket.emit('bot_response', `抱歉，处理您的请求时出现了错误。错误详情: ${error.message || '未知错误'}`);
    }
  });

  // 处理用户断开连接
  socket.on('disconnect', () => {
    console.log('用户断开连接');
    userSessions.delete(socket.id);
  });
});

// 启动服务器
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
});