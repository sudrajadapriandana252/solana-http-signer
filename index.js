import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import bs58 from 'bs58';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from '@solana/spl-token';

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const RPC_URL = process.env.RPC_URL || 'https://api.devnet.solana.com';
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';
const SECRET_B58 = process.env.DEPLOYER_SECRET_BASE58;
const PORT = process.env.PORT || 8080;

if (!SECRET_B58) { console.error('Missing DEPLOYER_SECRET_BASE58'); process.exit(1); }
const payer = Keypair.fromSecretKey(bs58.decode(SECRET_B58));
const conn = new Connection(RPC_URL, 'confirmed');

app.get('/health', (req, res) => res.json({ ok: true, pubkey: payer.publicKey.toBase58() }));

// simple auth
app.use((req, res, next) => {
  if (!AUTH_TOKEN) return next();
  if (req.header('X-Auth') !== AUTH_TOKEN) return res.status(401).json({ error: 'unauthorized' });
  next();
});

// Mint SPL token + optional initial supply (base units string)
app.post('/spl/create-token', async (req, res) => {
  try {
    const { name = '', symbol = '', decimals = 9, initialSupply = '0', receiver } = req.body || {};
    const mint = await createMint(conn, payer, payer.publicKey, null, Number(decimals));
    const mintAddr = mint.toBase58();

    const recv = new PublicKey(receiver || payer.publicKey);
    const ata = await getOrCreateAssociatedTokenAccount(conn, payer, mint, recv);

    const amt = BigInt(initialSupply || '0');
    if (amt > 0n) await mintTo(conn, payer, mint, ata.address, payer, amt);

    res.json({
      mintAddress: mintAddr,
      decimals: Number(decimals),
      meta: { name, symbol },
      receiver: recv.toBase58(),
      ata: ata.address.toBase58()
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'create-token failed' });
  }
});

app.listen(PORT, () => console.log(`Signer up :${PORT}, wallet ${payer.publicKey.toBase58()}`));
