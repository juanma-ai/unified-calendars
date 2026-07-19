import { Button, Flex, FlexBlock, FlexItem, Modal } from '@wordpress/components'

export function HiddenEventsModal({ hiddenEvents, isOpen, onClose, onRestore }) {
  if (!isOpen) return null

  return (
    <Modal title="Hidden events" onRequestClose={onClose} size="medium">
      <div className="hidden-events-list">
        {hiddenEvents.map((event) => (
          <Flex className="hidden-events-list__item" key={event.key} gap={4}>
            <FlexBlock>
              <strong>{event.title}</strong>
              <div className="hidden-events-list__meta">
                {event.scope === 'series' ? 'Entire series' : 'One occurrence'}
                {event.calendarName ? ` · ${event.calendarName}` : ''}
              </div>
            </FlexBlock>
            <FlexItem>
              <Button variant="secondary" onClick={() => onRestore(event.key)}>
                Restore
              </Button>
            </FlexItem>
          </Flex>
        ))}
      </div>
    </Modal>
  )
}
