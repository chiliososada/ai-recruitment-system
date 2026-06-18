import net from 'node:net';
import type { ScanResult } from '@ars/shared';
import type { AppConfig } from '../../config.js';

export interface VirusScanner {
  readonly name: string;
  scan(data: Buffer, filename: string): Promise<ScanResult>;
}

/**
 * Deterministic mock scanner. Flags the standard EICAR antivirus test signature as
 * `infected` so file-boundary tests can prove rejection works; everything else is `clean`.
 * Clearly labelled and NOT permitted in production (config.ts enforces this — FR-02.4).
 */
export class MockVirusScanner implements VirusScanner {
  readonly name = 'mock';
  // The official EICAR test string, assembled so this source file isn't itself flagged.
  private readonly signature =
    'X5O!P%@AP[4\\PZX54(P^)7CC)7}$' + 'EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

  async scan(data: Buffer): Promise<ScanResult> {
    return data.includes(this.signature) ? 'infected' : 'clean';
  }
}

/** ClamAV (clamd) adapter using the INSTREAM protocol over TCP (prod). */
export class ClamAvScanner implements VirusScanner {
  readonly name = 'clamav';
  constructor(
    private readonly host: string,
    private readonly port: number,
  ) {}

  scan(data: Buffer): Promise<ScanResult> {
    return new Promise((resolve) => {
      const socket = net.createConnection(this.port, this.host);
      let response = '';
      socket.on('error', () => resolve('error'));
      socket.on('connect', () => {
        socket.write('zINSTREAM\0');
        const size = Buffer.alloc(4);
        size.writeUInt32BE(data.length, 0);
        socket.write(size);
        socket.write(data);
        socket.write(Buffer.alloc(4)); // zero-length chunk terminates the stream
      });
      socket.on('data', (chunk) => {
        response += chunk.toString();
      });
      socket.on('end', () => {
        if (/FOUND/.test(response)) resolve('infected');
        else if (/OK/.test(response)) resolve('clean');
        else resolve('error');
      });
    });
  }
}

export function createVirusScanner(config: AppConfig): VirusScanner {
  if (config.VIRUS_SCANNER === 'clamav') {
    return new ClamAvScanner(config.CLAMAV_HOST, config.CLAMAV_PORT);
  }
  return new MockVirusScanner();
}
