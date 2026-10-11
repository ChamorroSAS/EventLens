#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import tls from 'node:tls';

// 1. Cargar variables de entorno desde .env o .env.local sin librerías externas
function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return false;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined || process.env[key] === '') {
      process.env[key] = val;
    }
  }
  return true;
}

// Cargar en orden de prioridad: .env.local -> .env
const projectRoot = process.cwd();
const loadedLocal = loadEnvFile(path.join(projectRoot, '.env.local'));
const loadedEnv = loadEnvFile(path.join(projectRoot, '.env'));

console.log('='.repeat(65));
console.log('  EventLens — Verificador de Envio SMTP (Brevo / Relay)');
console.log('='.repeat(65));

if (loadedLocal) console.log('  [ok] Cargado .env.local');
if (loadedEnv) console.log('  [ok] Cargado .env');

const smtpHost = process.env.SMTP_HOST || 'smtp-relay.brevo.com';
const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
const smtpSecure = process.env.SMTP_SECURE === 'true' || smtpPort === 465;
const smtpUser = process.env.SMTP_USER || '';
const smtpPass = process.env.SMTP_PASS || '';
const fromEmail = process.env.SMTP_FROM_EMAIL || smtpUser;
const fromName = process.env.SMTP_FROM_NAME || 'EventLens System';
const toEmail = process.argv[2] || process.env.SMTP_TEST_RECIPIENT || '';

// Validar parámetros mínimos
const missing = [];
if (!smtpHost) missing.push('SMTP_HOST');
if (!smtpUser) missing.push('SMTP_USER');
if (!smtpPass) missing.push('SMTP_PASS');
if (!fromEmail) missing.push('SMTP_FROM_EMAIL (o SMTP_USER)');
if (!toEmail) missing.push('SMTP_TEST_RECIPIENT (o pasalo como argumento: node scripts/test-smtp.mjs email@ejemplo.com)');

if (missing.length > 0) {
  console.error('\n[ERROR] Faltan variables de configuracion en tu archivo .env:');
  for (const m of missing) {
    console.error(`  - ${m}`);
  }
  console.error('\nInstrucciones:');
  console.error('1. Copia las variables correspondientes a tu archivo .env');
  console.error('2. Especifica el usuario y contrasena/clave de Brevo');
  console.error('3. Define el correo remitente verificado (SMTP_FROM_EMAIL) y destinatario (SMTP_TEST_RECIPIENT)');
  console.error('4. Vuelve a ejecutar: node scripts/test-smtp.mjs [opcional-destinatario]\n');
  process.exit(1);
}

console.log(`\nConfiguracion detectada:`);
console.log(`  Servidor:     ${smtpHost}:${smtpPort}`);
console.log(`  Modo Seguro:  ${smtpSecure ? 'SSL/TLS directo' : 'STARTTLS (puerto ' + smtpPort + ')'}`);
console.log(`  Usuario:      ${smtpUser}`);
console.log(`  Remitente:    ${fromName} <${fromEmail}>`);
console.log(`  Destinatario: ${toEmail}`);
console.log(`  Clave:        ${'*'.repeat(Math.min(smtpPass.length, 12))} (oculta)`);
console.log('-'.repeat(65));

// 2. Cliente SMTP nativo con socket
class SmtpSession {
  constructor() {
    this.socket = null;
    this.buffer = '';
    this.queue = [];
  }

  logStep(step, detail = '') {
    console.log(`  -> [${step}] ${detail}`);
  }

  readLine() {
    return new Promise((resolve, reject) => {
      const checkBuffer = () => {
        const idx = this.buffer.indexOf('\n');
        if (idx !== -1) {
          const line = this.buffer.slice(0, idx).replace(/\r$/, '');
          this.buffer = this.buffer.slice(idx + 1);
          return line;
        }
        return null;
      };

      const existing = checkBuffer();
      if (existing !== null) {
        resolve(existing);
        return;
      }

      const onData = (chunk) => {
        this.buffer += chunk.toString('utf8');
        const line = checkBuffer();
        if (line !== null) {
          cleanup();
          resolve(line);
        }
      };

      const onError = (err) => {
        cleanup();
        reject(err);
      };

      const onClose = () => {
        cleanup();
        reject(new Error('Conexion cerrada inesperadamente por el servidor SMTP'));
      };

      const cleanup = () => {
        this.socket.off('data', onData);
        this.socket.off('error', onError);
        this.socket.off('close', onClose);
      };

      this.socket.on('data', onData);
      this.socket.on('error', onError);
      this.socket.on('close', onClose);
    });
  }

  async readResponse() {
    const lines = [];
    while (true) {
      const line = await this.readLine();
      lines.push(line);
      // Las respuestas multilinea tienen formato "XYZ-..." y la linea final "XYZ ..."
      if (line.length >= 4 && line.charAt(3) === ' ') {
        break;
      }
      if (line.length === 3) {
        break;
      }
    }
    const full = lines.join('\n');
    const code = parseInt(lines[lines.length - 1].slice(0, 3), 10);
    return { code, lines, full };
  }

  async sendCommand(command, expectedCode) {
    this.socket.write(command + '\r\n');
    const res = await this.readResponse();
    if (expectedCode) {
      const allowed = Array.isArray(expectedCode) ? expectedCode : [expectedCode];
      if (!allowed.includes(res.code)) {
        throw new Error(
          `Respuesta no esperada para "${command.split(' ')[0]}": ${res.full}`
        );
      }
    }
    return res;
  }

  async connect() {
    this.logStep('CONEXION', `Conectando a ${smtpHost}:${smtpPort}...`);

    const tlsOptions = {
      host: smtpHost,
      port: smtpPort,
      servername: smtpHost.includes('brevo.com') ? 'smtp-relay.sendinblue.com' : smtpHost,
      checkServerIdentity(hostname, cert) {
        const err = tls.checkServerIdentity(hostname, cert);
        if (!err) return undefined;
        // Brevo usa certificados emitidos para *.sendinblue.com en su relay oficial
        if (
          hostname.includes('brevo.com') ||
          (cert && cert.subjectaltname && cert.subjectaltname.includes('sendinblue.com'))
        ) {
          const sendinblueErr = tls.checkServerIdentity('smtp-relay.sendinblue.com', cert);
          if (!sendinblueErr) return undefined;
        }
        return err;
      },
    };

    if (smtpSecure) {
      this.socket = tls.connect(tlsOptions);
    } else {
      this.socket = net.connect({
        host: smtpHost,
        port: smtpPort,
      });
    }

    await new Promise((resolve, reject) => {
      this.socket.once('connect', resolve);
      this.socket.once('secureConnect', resolve);
      this.socket.once('error', reject);
    });

    const greeting = await this.readResponse();
    if (greeting.code !== 220) {
      throw new Error(`Saludo invalido del servidor: ${greeting.full}`);
    }
    this.logStep('SALUDO', greeting.lines[0]);

    // EHLO
    let ehlo = await this.sendCommand('EHLO localhost', 250);

    // Si no es SSL directo, negociar STARTTLS
    if (!smtpSecure) {
      this.logStep('STARTTLS', 'Iniciando negociacion TLS segura...');
      await this.sendCommand('STARTTLS', 220);

      this.socket = tls.connect({
        socket: this.socket,
        ...tlsOptions,
      });

      await new Promise((resolve, reject) => {
        this.socket.once('secureConnect', resolve);
        this.socket.once('error', reject);
      });

      this.logStep('TLS_OK', 'Canal cifrado TLS establecido.');

      // Re-enviar EHLO sobre canal cifrado
      ehlo = await this.sendCommand('EHLO localhost', 250);
    }

    // Autenticacion AUTH LOGIN
    this.logStep('AUTH', 'Autenticando credenciales con el servidor...');
    await this.sendCommand('AUTH LOGIN', 334);

    const userB64 = Buffer.from(smtpUser).toString('base64');
    await this.sendCommand(userB64, 334);

    const passB64 = Buffer.from(smtpPass).toString('base64');
    const authRes = await this.sendCommand(passB64, [235, 250]);
    this.logStep('AUTH_OK', authRes.lines[0]);

    // MAIL FROM
    this.logStep('MAIL_FROM', `<${fromEmail}>`);
    await this.sendCommand(`MAIL FROM:<${fromEmail}>`, 250);

    // RCPT TO
    this.logStep('RCPT_TO', `<${toEmail}>`);
    await this.sendCommand(`RCPT TO:<${toEmail}>`, [250, 251]);

    // DATA
    this.logStep('DATA', 'Transmitiendo cuerpo del mensaje...');
    await this.sendCommand('DATA', 354);

    const dateStr = new Date().toUTCString();
    const messageId = `<eventlens-test-${Date.now()}@${smtpHost}>`;
    const subject = 'Prueba de envio de correspondencia — EventLens';

    const messageLines = [
      `From: "${fromName}" <${fromEmail}>`,
      `To: <${toEmail}>`,
      `Subject: ${subject}`,
      `Date: ${dateStr}`,
      `Message-ID: ${messageId}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      'Hola,',
      '',
      'Este es un mensaje de prueba emitido satisfactoriamente desde EventLens.',
      `Servidor relay utilizado: ${smtpHost}:${smtpPort}`,
      `Remitente autenticado:    ${smtpUser}`,
      `Fecha de emision:         ${dateStr}`,
      '',
      'Si recibes este correo, la configuracion SMTP de Brevo es plenamente operativa.',
      '',
      '— EventLens Platform',
      '.',
    ];

    const dataRes = await this.sendCommand(messageLines.join('\r\n'), 250);
    this.logStep('ENTREGA_OK', dataRes.lines[0]);

    // QUIT
    await this.sendCommand('QUIT', 221);
    this.socket.end();
  }
}

// 3. Ejecucion principal
async function run() {
  const session = new SmtpSession();
  try {
    await session.connect();
    console.log('\n' + '='.repeat(65));
    console.log('  [EXITO] El correo de prueba fue aceptado por el servidor SMTP.');
    console.log(`  Por favor revisa la bandeja de entrada de: ${toEmail}`);
    console.log('='.repeat(65) + '\n');
    process.exit(0);
  } catch (err) {
    console.error('\n' + '!'.repeat(65));
    console.error(`  [FALLO EN EL ENVIO] ${err.message}`);
    console.error('!'.repeat(65));

    if (err.message.includes('535') || err.message.includes('Authentication')) {
      console.error('\nNota Brevo: Error 535 indica credenciales no validas.');
      console.error('Asegurate de usar tu SMTP Key o Master Key de Brevo (no tu contrasena web).');
    } else if (err.message.includes('550') || err.message.includes('sender')) {
      console.error('\nNota Brevo: Error de remitente.');
      console.error('Asegurate de que SMTP_FROM_EMAIL este verificado en tu panel de Brevo.');
    }
    console.error('');
    process.exit(1);
  }
}

run();
