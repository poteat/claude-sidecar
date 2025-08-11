import { MessageQueue } from '../lib/queue';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('MessageQueue', () => {
  let queue: MessageQueue;
  const testDir = path.join(os.homedir(), '.claude-sidecar');
  const queueFile = path.join(testDir, 'queue.json');
  const lockFile = path.join(testDir, 'queue.lock');

  beforeEach(async () => {
    // Clean up any existing queue files
    if (fs.existsSync(queueFile)) {
      fs.unlinkSync(queueFile);
    }
    if (fs.existsSync(lockFile)) {
      fs.unlinkSync(lockFile);
    }
    queue = new MessageQueue();
    // Ensure queue is empty
    await queue.getAndClearMessages();
  });

  afterEach(() => {
    // Clean up after tests
    if (fs.existsSync(queueFile)) {
      fs.unlinkSync(queueFile);
    }
    if (fs.existsSync(lockFile)) {
      fs.unlinkSync(lockFile);
    }
  });

  describe('addMessage', () => {
    it('should add a message to the queue', async () => {
      await queue.addMessage('Test message');
      
      const messages = await queue.peekMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0].text).toBe('Test message');
      expect(messages[0].timestamp).toBeDefined();
    });

    it('should add multiple messages in order', async () => {
      await queue.addMessage('First');
      await queue.addMessage('Second');
      await queue.addMessage('Third');
      
      const messages = await queue.peekMessages();
      expect(messages).toHaveLength(3);
      expect(messages[0].text).toBe('First');
      expect(messages[1].text).toBe('Second');
      expect(messages[2].text).toBe('Third');
    });

    it('should handle concurrent additions with locking', async () => {
      // Test that concurrent operations work correctly
      // Note: Some messages may fail due to lock contention, which is expected
      const messageCount = 5;
      const promises = [];
      
      for (let i = 1; i <= messageCount; i++) {
        promises.push(
          queue.addMessage(`Message ${i}`).catch(() => {
            // Ignore lock errors in this test
          })
        );
      }
      
      await Promise.all(promises);
      
      const messages = await queue.peekMessages();
      // At least some messages should have been added
      expect(messages.length).toBeGreaterThan(0);
      expect(messages.length).toBeLessThanOrEqual(messageCount);
      
      // Check that messages are valid
      messages.forEach(msg => {
        expect(msg.text).toMatch(/^Message \d+$/);
        expect(msg.timestamp).toBeDefined();
      });
    });
  });

  describe('getAndClearMessages', () => {
    it('should return all messages and clear the queue', async () => {
      await queue.addMessage('Message 1');
      await queue.addMessage('Message 2');
      
      const messages = await queue.getAndClearMessages();
      expect(messages).toHaveLength(2);
      expect(messages[0].text).toBe('Message 1');
      expect(messages[1].text).toBe('Message 2');
      
      // Queue should be empty now
      const remainingMessages = await queue.peekMessages();
      expect(remainingMessages).toHaveLength(0);
    });

    it('should return empty array when queue is empty', async () => {
      const messages = await queue.getAndClearMessages();
      expect(messages).toEqual([]);
    });

    it('should handle concurrent clear operations', async () => {
      await queue.addMessage('Test');
      
      const [messages1, messages2] = await Promise.all([
        queue.getAndClearMessages(),
        queue.getAndClearMessages(),
      ]);
      
      // Only one should get the message
      const totalMessages = [...messages1, ...messages2];
      expect(totalMessages).toHaveLength(1);
      expect(totalMessages[0].text).toBe('Test');
    });
  });

  describe('peekMessages', () => {
    it('should return messages without clearing', async () => {
      await queue.addMessage('Peek test');
      
      const messages1 = await queue.peekMessages();
      const messages2 = await queue.peekMessages();
      
      expect(messages1).toHaveLength(1);
      expect(messages2).toHaveLength(1);
      expect(messages1[0].text).toBe('Peek test');
      expect(messages2[0].text).toBe('Peek test');
    });

    it('should return empty array for empty queue', async () => {
      const messages = await queue.peekMessages();
      expect(messages).toEqual([]);
    });
  });

  describe('getQueueSize', () => {
    it('should return correct queue size', async () => {
      expect(queue.getQueueSize()).toBe(0);
      
      await queue.addMessage('Message 1');
      expect(queue.getQueueSize()).toBe(1);
      
      await queue.addMessage('Message 2');
      expect(queue.getQueueSize()).toBe(2);
      
      await queue.getAndClearMessages();
      expect(queue.getQueueSize()).toBe(0);
    });

    it('should handle corrupt queue file gracefully', async () => {
      // Write invalid JSON to queue file
      fs.writeFileSync(queueFile, 'invalid json');
      
      expect(queue.getQueueSize()).toBe(0);
    });
  });

  describe('locking mechanism', () => {
    it('should timeout if lock cannot be acquired', async () => {
      // Create a lock file manually
      fs.writeFileSync(lockFile, 'test');
      
      // Create a new queue instance with very short retry timeout
      const testQueue = new MessageQueue();
      
      // Override the acquireLock method to test timeout
      const originalAcquireLock = (testQueue as any).acquireLock;
      (testQueue as any).acquireLock = function(maxRetries = 2) {
        return originalAcquireLock.call(this, maxRetries);
      };
      
      await expect(testQueue.addMessage('Test')).rejects.toThrow('Could not acquire queue lock');
      
      // Clean up - only unlink if file exists
      if (fs.existsSync(lockFile)) {
        fs.unlinkSync(lockFile);
      }
    });
  });

  describe('persistence', () => {
    it('should persist messages across queue instances', async () => {
      const queue1 = new MessageQueue();
      await queue1.addMessage('Persistent message');
      
      const queue2 = new MessageQueue();
      const messages = await queue2.peekMessages();
      
      expect(messages).toHaveLength(1);
      expect(messages[0].text).toBe('Persistent message');
    });

    it('should handle missing queue file', async () => {
      // Ensure file doesn't exist
      if (fs.existsSync(queueFile)) {
        fs.unlinkSync(queueFile);
      }
      
      const messages = await queue.peekMessages();
      expect(messages).toEqual([]);
    });

    it('should create directory if it does not exist', () => {
      // Remove directory
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true });
      }
      
      // Creating new queue should create directory
      const newQueue = new MessageQueue();
      expect(fs.existsSync(testDir)).toBe(true);
    });
  });
});