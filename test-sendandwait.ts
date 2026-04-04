/**
 * Simple test to verify sendAndWait returns AssistantMessageEvent
 */
import { CopilotClient } from '@github/copilot-sdk';

const main = async () => {
  const client = new CopilotClient({
    cliPath: undefined, // Use bundled CLI
  });

  try {
    console.log('[Test] Creating session...');
    const session = await client.createSession({ model: 'gpt-4o' });
    console.log(`[Test] Session created: ${session.sessionId}`);

    // Hook up event logging
    let eventCount = 0;
    session.on((event) => {
      eventCount++;
      console.log(`[Test] Event #${eventCount}: ${event.type}`);
      if (event.type === 'assistant.message') {
        const msg = event as any;
        console.log(`[Test]   -> Content length: ${msg.data?.content?.length ?? 0}`);
      }
    });

    console.log('[Test] Sending message with sendAndWait...');
    const result = await session.sendAndWait(
      { prompt: 'What is 2+2? Answer briefly.' },
      15000, // 15s timeout
    );

    console.log('[Test] sendAndWait returned:', result);
    if (result) {
      console.log(`[Test]   Type: ${result.type}`);
      console.log(`[Test]   Content length: ${result.data?.content?.length ?? 0}`);
      console.log(`[Test]   Content (first 100 chars): ${(result.data?.content ?? '').slice(0, 100)}`);
    } else {
      console.log('[Test]   Result is undefined!');
    }

    console.log(`[Test] Total events received via session.on(): ${eventCount}`);

    await session.disconnect();
    console.log('[Test] Done');
  } catch (err) {
    console.error('[Test] Error:', err);
    process.exit(1);
  }
};

main().catch(console.error);
