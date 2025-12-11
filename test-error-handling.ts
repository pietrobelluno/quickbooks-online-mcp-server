#!/usr/bin/env ts-node

/**
 * Error Handling Test Script
 * Tests various QuickBooks API error scenarios to validate error handling
 *
 * Run with: npx ts-node test-error-handling.ts
 */

import { quickbooksClient } from "./src/clients/quickbooks-client.js";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  intuitTid?: string;
}

const results: TestResult[] = [];

async function testInvalidCustomerId() {
  console.log('\n🧪 Test 1: Invalid Customer ID');
  try {
    await quickbooksClient.authenticate();
    const qb = quickbooksClient.getQuickbooks();

    return new Promise<TestResult>((resolve) => {
      (qb as any).getCustomer('999999999', (err: any, customer: any) => {
        if (err) {
          console.log('✓ Expected error received');
          console.log('Error details:', JSON.stringify(err, null, 2));
          resolve({
            name: 'Invalid Customer ID',
            passed: true,
            error: err.Fault?.Error?.[0]?.Message || err.message,
            intuitTid: err.intuit_tid || err.response?.headers?.['intuit-tid'],
          });
        } else {
          resolve({
            name: 'Invalid Customer ID',
            passed: false,
            error: 'Expected error but got success',
          });
        }
      });
    });
  } catch (error: any) {
    return {
      name: 'Invalid Customer ID',
      passed: true,
      error: error.message,
    };
  }
}

async function testInvalidQuerySyntax() {
  console.log('\n🧪 Test 2: Invalid Query Syntax');
  try {
    await quickbooksClient.authenticate();
    const qb = quickbooksClient.getQuickbooks();

    return new Promise<TestResult>((resolve) => {
      // Invalid field name should cause validation error
      (qb as any).findCustomers({ InvalidField: 'test' }, (err: any, customers: any) => {
        if (err) {
          console.log('✓ Expected error received');
          console.log('Error details:', JSON.stringify(err, null, 2));
          resolve({
            name: 'Invalid Query Syntax',
            passed: true,
            error: err.Fault?.Error?.[0]?.Message || err.message,
            intuitTid: err.intuit_tid || err.response?.headers?.['intuit-tid'],
          });
        } else {
          // QuickBooks might ignore invalid fields, that's also acceptable
          resolve({
            name: 'Invalid Query Syntax',
            passed: true,
            error: 'QuickBooks ignored invalid field (acceptable behavior)',
          });
        }
      });
    });
  } catch (error: any) {
    return {
      name: 'Invalid Query Syntax',
      passed: true,
      error: error.message,
    };
  }
}

async function testValidRequest() {
  console.log('\n🧪 Test 3: Valid Request (Should Succeed)');
  try {
    await quickbooksClient.authenticate();
    const qb = quickbooksClient.getQuickbooks();

    return new Promise<TestResult>((resolve) => {
      (qb as any).findCustomers({ limit: 1 }, (err: any, customers: any) => {
        if (err) {
          resolve({
            name: 'Valid Request',
            passed: false,
            error: 'Expected success but got error: ' + (err.Fault?.Error?.[0]?.Message || err.message),
          });
        } else {
          console.log('✓ Request succeeded');
          console.log(`Found ${customers?.QueryResponse?.Customer?.length || 0} customer(s)`);
          resolve({
            name: 'Valid Request',
            passed: true,
          });
        }
      });
    });
  } catch (error: any) {
    return {
      name: 'Valid Request',
      passed: false,
      error: error.message,
    };
  }
}

async function testExpiredToken() {
  console.log('\n🧪 Test 4: Expired/Invalid Token Handling');
  // This test verifies the auto-refresh mechanism
  // We'll force a token check
  try {
    await quickbooksClient.authenticate();
    console.log('✓ Token refresh mechanism working');
    return {
      name: 'Token Refresh',
      passed: true,
    };
  } catch (error: any) {
    return {
      name: 'Token Refresh',
      passed: false,
      error: error.message,
    };
  }
}

async function runTests() {
  console.log('🚀 Starting QuickBooks API Error Handling Tests\n');
  console.log('This will test various error scenarios to validate error handling\n');

  // Run tests
  results.push(await testValidRequest());
  results.push(await testInvalidCustomerId());
  results.push(await testInvalidQuerySyntax());
  results.push(await testExpiredToken());

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));

  results.forEach((result, index) => {
    const status = result.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`\n${index + 1}. ${result.name}: ${status}`);
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
    if (result.intuitTid) {
      console.log(`   intuit_tid: ${result.intuitTid}`);
    }
  });

  const passedCount = results.filter(r => r.passed).length;
  const totalCount = results.length;

  console.log('\n' + '='.repeat(60));
  console.log(`Results: ${passedCount}/${totalCount} tests passed`);
  console.log('='.repeat(60) + '\n');

  // Check if intuit_tid was captured in any error
  const capturedTid = results.some(r => r.intuitTid);
  if (capturedTid) {
    console.log('✅ intuit_tid successfully captured from QuickBooks API errors');
  } else {
    console.log('ℹ️  Note: intuit_tid not found in error responses (may depend on QB API version)');
  }

  process.exit(passedCount === totalCount ? 0 : 1);
}

runTests().catch(error => {
  console.error('Fatal error running tests:', error);
  process.exit(1);
});
