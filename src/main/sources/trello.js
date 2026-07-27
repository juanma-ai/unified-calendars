import { config } from '../config.js'
import { mapTrelloCard } from './calendarEventMappers.js'

const BASE_URL = 'https://api.trello.com/1'

function authQuery() {
  return `key=${encodeURIComponent(config.trello.apiKey)}&token=${encodeURIComponent(config.trello.token)}`
}

async function fetchBoards() {
  const res = await fetch(`${BASE_URL}/members/me/boards?fields=id,name&filter=open&${authQuery()}`)
  if (!res.ok) throw new Error(`Trello boards request failed: ${res.status}`)

  const boards = await res.json()
  if (config.trello.boardIds.length === 0) return boards
  return boards.filter((board) => config.trello.boardIds.includes(board.id))
}

async function fetchCurrentMember() {
  const res = await fetch(`${BASE_URL}/members/me?fields=id,fullName,username,initials&${authQuery()}`)
  if (!res.ok) throw new Error(`Trello current member request failed: ${res.status}`)
  return res.json()
}

async function fetchBoardCards(board) {
  const [cardsRes, membersRes] = await Promise.all([
    fetch(`${BASE_URL}/boards/${board.id}/cards?fields=name,due,dueComplete,shortUrl,idMembers&${authQuery()}`),
    fetch(`${BASE_URL}/boards/${board.id}/members?fields=id,fullName,username,initials&${authQuery()}`)
  ])

  if (!cardsRes.ok) throw new Error(`Trello cards request failed for board ${board.id}: ${cardsRes.status}`)
  if (!membersRes.ok) throw new Error(`Trello members request failed for board ${board.id}: ${membersRes.status}`)

  return { board, cards: await cardsRes.json(), members: await membersRes.json() }
}

export function filterIncompleteTrelloCards(cards) {
  return cards.filter((card) => !card.dueComplete)
}

export async function fetchTrelloEvents(rangeStart, rangeEnd) {
  if (!config.trello.apiKey || !config.trello.token) {
    return { events: [], statuses: [{ source: 'trello', ok: false, lastError: 'not-connected' }] }
  }

  try {
    const rangeStartMs = new Date(rangeStart).getTime()
    const rangeEndMs = new Date(rangeEnd).getTime()

    const [currentMember, boards] = await Promise.all([fetchCurrentMember(), fetchBoards()])
    const cardsPerBoard = await Promise.all(boards.map(fetchBoardCards))
    const calendars = boards.map((board) => ({
      source: 'trello',
      calendarId: `trello:${board.id}`,
      calendarName: board.name,
      calendarDefaultColor: '#9b7a00',
      calendarDefaultVisible: false
    }))

    // Trello has no server-side "has a due date in this range" filter, so fetch
    // each board's open cards and narrow down client-side.
    const events = cardsPerBoard.flatMap(({ board, cards, members }) => {
      const membersById = new Map(members.map((member) => [member.id, member]))
      return filterIncompleteTrelloCards(cards)
        .filter((card) => card.due)
        .filter((card) => {
          const dueMs = new Date(card.due).getTime()
          return dueMs >= rangeStartMs && dueMs <= rangeEndMs
        })
        .map((card) => mapTrelloCard(card, board, {
          currentMemberId: currentMember.id,
          membersById
        }))
    })

    return {
      events,
      calendars,
      statuses: [{ source: 'trello', ok: true, lastSyncedAt: new Date().toISOString() }]
    }
  } catch (err) {
    return { events: [], statuses: [{ source: 'trello', ok: false, lastError: err.message }] }
  }
}
