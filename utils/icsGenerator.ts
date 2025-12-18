export function generateICS(event: any): string {
  const formatDate = (date: Date): string => {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  };

  const escapeText = (text: string): string => {
    if (!text) return '';
    return text
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '');
  };

  const now = new Date();
  const startDate = new Date(event.start);
  const endDate = new Date(event.end);
  
  // Generate a unique ID for the event
  const uid = `${startDate.getTime()}-${event.title?.replace(/[^a-zA-Z0-9]/g, '')}-triad-build@triad.build`;
  
  let icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//triad.build//Event Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${formatDate(now)}`,
    `DTSTART:${formatDate(startDate)}`,
    `DTEND:${formatDate(endDate)}`,
    `SUMMARY:${escapeText(event.title || 'Untitled Event')}`,
  ];

  if (event.extendedProps?.description) {
    // Strip HTML tags from description
    const plainDescription = event.extendedProps.description.replace(/<[^>]*>/g, '');
    icsContent.push(`DESCRIPTION:${escapeText(plainDescription)}`);
  }

  if (event.extendedProps?.location) {
    icsContent.push(`LOCATION:${escapeText(event.extendedProps.location)}`);
  }

  if (event.url) {
    icsContent.push(`URL:${event.url}`);
  }

  icsContent.push(
    'STATUS:CONFIRMED',
    'TRANSP:OPAQUE',
    'END:VEVENT',
    'END:VCALENDAR'
  );

  return icsContent.join('\r\n');
}

export function downloadICS(event: any): void {
  const icsContent = generateICS(event);
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = `${event.title?.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '-') || 'event'}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
