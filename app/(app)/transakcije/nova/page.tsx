import type { Metadata } from 'next';
import { TransactionNovaClient } from './transaction-nova-client';

export const metadata: Metadata = {
  title: 'Nova transakcija — Konto',
};

export default function NovaTransakcijaPage() {
  return <TransactionNovaClient />;
}
