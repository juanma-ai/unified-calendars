import {
  Button,
  CheckboxControl,
  Modal,
  Notice,
  SelectControl,
  Spinner,
  TextControl,
  TextareaControl,
  ToggleControl
} from '@wordpress/components'
import { createContext, useContext, useState } from 'react'
import { EDITOR_ATTENDEES, updateForm, validateForm } from '../eventEditorModel.js'

// Provided only by the family web, which is the one surface that writes
// events through a form. EventPill reads it to offer "Editar"; without a
// provider (Electron) there is nothing to offer.
export const EventEditingContext = createContext(null)
export const useEventEditing = () => useContext(EventEditingContext)

export function EventEditor({ event, initialForm, calendars, timeZone, onSave, onClose }) {
  const [form, setForm] = useState(initialForm)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const set = (key) => (value) => setForm((current) => updateForm(current, key, value, timeZone))
  // A whole file moves between calendars, so one occurrence cannot.
  const lockedCalendar = Boolean(event?.recurrenceId)

  async function handleSubmit(submitEvent) {
    submitEvent.preventDefault()
    const problem = validateForm(form, timeZone)
    if (problem) { setError(problem); return }
    setSaving(true)
    setError(null)
    try {
      await onSave(form)
    } catch (saveError) {
      setError(saveError?.message || 'No se pudo guardar el evento.')
      setSaving(false)
    }
  }

  return (
    <Modal
      className="event-editor"
      title={event ? 'Editar evento' : 'Nuevo evento'}
      onRequestClose={saving ? () => {} : onClose}
      size="medium"
    >
      <form className="event-editor__form" onSubmit={handleSubmit} noValidate>
        {error && (
          <Notice status="error" isDismissible={false}>
            {error}
          </Notice>
        )}
        <TextControl
          __next40pxDefaultSize
          __nextHasNoMarginBottom
          label="Título"
          value={form.title}
          onChange={set('title')}
          required
        />
        <ToggleControl
          __nextHasNoMarginBottom
          label="Todo el día"
          checked={form.allDay}
          onChange={set('allDay')}
        />
        <div className="event-editor__when">
          <TextControl
            __next40pxDefaultSize
            __nextHasNoMarginBottom
            label="Empieza"
            type="date"
            value={form.startDate}
            onChange={set('startDate')}
          />
          {!form.allDay && (
            <TextControl
              __next40pxDefaultSize
              __nextHasNoMarginBottom
              label="Hora de inicio"
              type="time"
              step={300}
              value={form.startTime}
              onChange={set('startTime')}
            />
          )}
          <TextControl
            __next40pxDefaultSize
            __nextHasNoMarginBottom
            label="Termina"
            type="date"
            value={form.endDate}
            onChange={set('endDate')}
          />
          {!form.allDay && (
            <TextControl
              __next40pxDefaultSize
              __nextHasNoMarginBottom
              label="Hora de fin"
              type="time"
              step={300}
              value={form.endTime}
              onChange={set('endTime')}
            />
          )}
        </div>
        <SelectControl
          __next40pxDefaultSize
          __nextHasNoMarginBottom
          label="Calendario"
          value={form.calendarId}
          onChange={set('calendarId')}
          disabled={lockedCalendar}
          help={lockedCalendar ? 'Es una ocurrencia de una serie: solo se puede cambiar de calendario la serie entera, desde el iPhone.' : undefined}
          options={calendars.map((calendar) => ({ label: calendar.calendarName, value: calendar.calendarId }))}
        />
        <fieldset className="event-editor__attendees">
          <legend>Asistentes</legend>
          {EDITOR_ATTENDEES.map((name) => (
            <CheckboxControl
              __nextHasNoMarginBottom
              key={name}
              label={name}
              checked={form.attendees.includes(name)}
              onChange={(checked) =>
                set('attendees')(checked ? [...form.attendees, name] : form.attendees.filter((item) => item !== name))
              }
            />
          ))}
        </fieldset>
        <TextControl
          __next40pxDefaultSize
          __nextHasNoMarginBottom
          label="Lugar"
          value={form.location}
          onChange={set('location')}
        />
        <TextareaControl
          __nextHasNoMarginBottom
          label="Notas"
          rows={3}
          value={form.description}
          onChange={set('description')}
        />
        <div className="event-editor__actions">
          <Button __next40pxDefaultSize variant="tertiary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button __next40pxDefaultSize variant="primary" type="submit" disabled={saving} aria-busy={saving}>
            {saving && <Spinner />}
            {saving ? 'Guardando' : 'Guardar'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
