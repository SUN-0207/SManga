interface Props {
  children?: React.ReactNode;
}

export function DeletedCommentItem({ children }: Props) {
  return (
    <div>
      <div className="bg-bg-subtle text-fg-muted italic px-4 py-2 rounded-md text-body-sm">
        Bình luận đã bị xoá
      </div>
      {children && <div className="mt-2">{children}</div>}
    </div>
  );
}
