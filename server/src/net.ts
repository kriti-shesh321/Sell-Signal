import net from 'node:net';

/**
 * Node 20+ "happy eyeballs" gives each IPv4/IPv6 address only 250 ms to connect.
 * High-latency links (e.g. ~280 ms to a us-east-1 database or a distant website) then fail
 * with ETIMEDOUT even though the host is reachable. Allow each attempt a realistic budget.
 */
export function configureNetwork(): void {
  net.setDefaultAutoSelectFamilyAttemptTimeout(2000);
}
