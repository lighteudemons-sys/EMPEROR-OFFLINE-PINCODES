'use client';

import { ETAMonitoringDashboard } from '@/components/eta-monitoring-dashboard';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'ETA Monitoring Dashboard',
  description: 'Monitor Egyptian Tax Authority OAuth tokens and submissions',
};

export default function ETAMonitoringPage() {
  return <ETAMonitoringDashboard />;
}
