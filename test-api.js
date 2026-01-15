// Test script for API endpoints
const http = require('http');
const crypto = require('crypto');

// Simple JWT creation without external library
function base64url(str) {
  return Buffer.from(str).toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function createJWT(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify(payload));
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${headerB64}.${payloadB64}.${signature}`;
}

const JWT_SECRET = 'N2X1iIyqrFkw3gst7HzCrN1rSTx80r1AZBw2MV+GPP8=';
const USER_ID = '6967fc0c4f5073fba4893291';
const COURSE_ID = '447be4b9-3a9e-44c1-89a6-3d366d4f085f';
const TEST_ID = '644d7521-cbde-4c02-b4bb-e2396df9a153';

const token = createJWT({
  sub: USER_ID,
  email: 'test@test.com',
  roles: ['teacher'],
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 3600
}, JWT_SECRET);

console.log('Generated JWT:', token.substring(0, 50) + '...');

function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port: 3002,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        console.log(`\n${method} ${path}`);
        console.log(`Status: ${res.statusCode}`);
        try {
          const json = JSON.parse(body);
          console.log('Response:', JSON.stringify(json, null, 2));
          resolve({ status: res.statusCode, data: json });
        } catch (e) {
          console.log('Response:', body);
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', (e) => {
      console.error(`Error: ${e.message}`);
      reject(e);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function runTests() {
  console.log('=== Testing Main Module API ===\n');

  // Quick test - direct attempt fetch
  console.log('=== Quick test: fetch existing attempt ===');
  await makeRequest('GET', '/api/attempts/05d78c88-fd5d-4f98-84c6-c851d29f600b');

  // Test 1: Get test details to see questions
  const testDetails = await makeRequest('GET', `/api/tests/${TEST_ID}`);
  
  if (!testDetails.data.questions || testDetails.data.questions.length === 0) {
    console.log('\n=== Creating question with correct answer ===');
    await makeRequest('POST', `/api/tests/${TEST_ID}/questions`, {
      text: 'What is 2+2?',
      options: [
        { text: '3', is_correct: false },
        { text: '4', is_correct: true },
        { text: '5', is_correct: false }
      ]
    });
  }

  // Get updated test details
  const updatedTest = await makeRequest('GET', `/api/tests/${TEST_ID}`);
  const questions = updatedTest.data.questions || [];
  
  if (questions.length === 0) {
    console.log('No questions in test, cannot test scoring');
    return;
  }

  // Test 2: Create test attempt
  console.log('\n=== Creating test attempt ===');
  const attemptResult = await makeRequest('POST', '/api/tests/attempts', {
    test_id: TEST_ID
  });

  if (attemptResult.status !== 201 && attemptResult.status !== 200) {
    console.log('Failed to create attempt');
    return;
  }

  const attemptId = attemptResult.data.attempt_id || attemptResult.data.id;
  console.log('Attempt ID:', attemptId);

  // Test 3: Get attempt details
  const attemptDetails = await makeRequest('GET', `/api/attempts/${attemptId}`);
  
  // Test 4: Answer questions - select correct answers
  console.log('\n=== Answering questions ===');
  const answers = attemptDetails.data.answers || [];
  
  for (const answer of answers) {
    // Get question details to find correct option
    const questionDetails = await makeRequest('GET', `/api/questions/${answer.question_id}`);
    const correctOption = questionDetails.data.options?.find(o => o.is_correct);
    
    if (correctOption) {
      console.log(`Answering question ${answer.question_id} with correct option ${correctOption.id}`);
      await makeRequest('PUT', `/api/attempts/${attemptId}/answers/${answer.id}`, {
        option_id: correctOption.id
      });
    }
  }

  // Test 5: Finish attempt
  console.log('\n=== Finishing attempt ===');
  const finishResult = await makeRequest('POST', `/api/attempts/${attemptId}/finish`);
  
  console.log('\n=== Final attempt result ===');
  await makeRequest('GET', `/api/attempts/${attemptId}`);

  console.log('\n=== Tests completed ===');
}

runTests().catch(console.error);
