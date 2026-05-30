import { createFileRoute, redirect } from '@tanstack/react-router';
import { useAuthStore } from '@/stores/auth-store';

export const Route = createFileRoute('/ban')({
  beforeLoad: () => {
    const user = useAuthStore.getState().user;
    if (user) {
      throw redirect({ to: '/tai-khoan' });
    }
    throw redirect({ to: '/dang-nhap', search: { redirect: '/tai-khoan' } });
  },
  component: () => null,
});
