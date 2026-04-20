import { afterEach, describe, expect, it, vi } from 'vitest';
import { getGatewayRuntimeRole, getGatewayWorkerRedisConfig, shouldRunGatewayServer, shouldRunGatewayWorker, } from './runtime-config.js';
afterEach(() => {
    vi.unstubAllEnvs();
});
describe('getGatewayRuntimeRole', () => {
    it('defaults to running both server and worker', () => {
        expect(getGatewayRuntimeRole()).toBe('all');
        expect(shouldRunGatewayServer()).toBe(true);
        expect(shouldRunGatewayWorker()).toBe(true);
    });
    it('supports running only the HTTP server', () => {
        vi.stubEnv('GATEWAY_RUNTIME_ROLE', 'server');
        expect(getGatewayRuntimeRole()).toBe('server');
        expect(shouldRunGatewayServer()).toBe(true);
        expect(shouldRunGatewayWorker()).toBe(false);
    });
    it('supports running only the worker', () => {
        vi.stubEnv('GATEWAY_RUNTIME_ROLE', 'worker');
        expect(getGatewayRuntimeRole()).toBe('worker');
        expect(shouldRunGatewayServer()).toBe(false);
        expect(shouldRunGatewayWorker()).toBe(true);
    });
    it('throws on invalid roles so startup fails fast', () => {
        vi.stubEnv('GATEWAY_RUNTIME_ROLE', 'queue');
        expect(() => getGatewayRuntimeRole()).toThrow(/GATEWAY_RUNTIME_ROLE/);
    });
});
describe('getGatewayWorkerRedisConfig', () => {
    it('uses lower-chatter defaults in production', () => {
        vi.stubEnv('NODE_ENV', 'production');
        expect(getGatewayWorkerRedisConfig()).toMatchObject({
            drainDelaySeconds: 60,
            stalledIntervalMs: 300_000,
            heartbeatIntervalMs: 300_000,
            queueDiagnosticsCacheMs: 30_000,
            maintenanceWorkersEnabled: true,
        });
    });
    it('respects explicit overrides', () => {
        vi.stubEnv('NODE_ENV', 'production');
        vi.stubEnv('GATEWAY_BULLMQ_DRAIN_DELAY_SECONDS', '90');
        vi.stubEnv('GATEWAY_BULLMQ_STALLED_INTERVAL_MS', '600000');
        vi.stubEnv('GATEWAY_WORKER_HEARTBEAT_INTERVAL_MS', '120000');
        vi.stubEnv('GATEWAY_WORKER_HEARTBEAT_TTL_SECS', '600');
        vi.stubEnv('GATEWAY_WORKER_HEARTBEAT_STALE_MS', '240000');
        vi.stubEnv('GATEWAY_QUEUE_DIAGNOSTICS_CACHE_MS', '45000');
        vi.stubEnv('GATEWAY_ENABLE_MAINTENANCE_WORKERS', 'false');
        expect(getGatewayWorkerRedisConfig()).toMatchObject({
            drainDelaySeconds: 90,
            stalledIntervalMs: 600_000,
            heartbeatIntervalMs: 120_000,
            heartbeatTtlSecs: 600,
            heartbeatStaleMs: 240_000,
            queueDiagnosticsCacheMs: 45_000,
            maintenanceWorkersEnabled: false,
        });
    });
});
