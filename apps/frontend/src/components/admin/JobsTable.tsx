import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { jobsApi, type JobRow } from '@/api/jobs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, Tbody, Td, Th, Thead, Tr } from '@/components/ui/table';

const VARIANT: Record<string, 'default' | 'success' | 'destructive' | 'secondary'> = {
  completed: 'success',
  waiting: 'secondary',
  active: 'default',
  failed: 'destructive',
  delayed: 'secondary',
  paused: 'secondary',
};

export function JobsTable({ jobs }: { jobs: JobRow[] }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  async function retry(id: string) {
    setBusy(id);
    try {
      await jobsApi.retry(id);
      await queryClient.invalidateQueries({ queryKey: ['jobs'] });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Table>
      <Thead>
        <Tr>
          <Th className="w-40">Job</Th>
          <Th>State</Th>
          <Th>Retries</Th>
          <Th>Tạo</Th>
          <Th>Lỗi</Th>
          <Th></Th>
        </Tr>
      </Thead>
      <Tbody>
        {jobs.map((j) => (
          <Tr key={j.id}>
            <Td className="font-mono text-xs">{j.name}</Td>
            <Td>
              <Badge variant={VARIANT[j.state] ?? 'secondary'}>{j.state}</Badge>
            </Td>
            <Td>{j.attemptsMade}</Td>
            <Td className="text-xs">
              {j.timestamp ? new Date(j.timestamp).toLocaleString('vi-VN') : '—'}
            </Td>
            <Td className="text-xs max-w-md truncate text-destructive">
              {j.failedReason ?? ''}
            </Td>
            <Td>
              {j.state === 'failed' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => retry(j.id)}
                  disabled={busy === j.id}
                  className="cursor-pointer"
                >
                  Retry
                </Button>
              )}
            </Td>
          </Tr>
        ))}
        {jobs.length === 0 && (
          <Tr>
            <Td colSpan={6} className="text-center text-muted-foreground py-8">
              Không có job nào
            </Td>
          </Tr>
        )}
      </Tbody>
    </Table>
  );
}
