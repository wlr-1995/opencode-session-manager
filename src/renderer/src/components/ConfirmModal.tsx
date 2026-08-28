interface Props {
  title: string
  message: string
  confirmText?: string
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmModal({ title, message, confirmText = '确认', onConfirm, onCancel }: Props) {
  return (
    <div className="modal-mask" onClick={onCancel}>
      <div className="modal small" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
        </div>
        <p className="confirm-message">{message}</p>
        <div className="modal-foot">
          <button className="btn" onClick={onCancel}>
            取消
          </button>
          <button className="btn danger" onClick={onConfirm}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
