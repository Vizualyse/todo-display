// Tabs in the heart menu. Editing is reached by tapping a card, so it has no entry.
export const TABS = [
  { id: 'list', label: 'My list', title: 'My lovely list' },
  { id: 'add', label: 'Add a todo', title: 'Something new' },
]
export const EDIT_TITLE = 'A little change'

export const tabTitle = (tab) => TABS.find((t) => t.id === tab)?.title ?? EDIT_TITLE
