<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, provide } from 'vue'
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import $ from 'jquery';
import { DateTime } from 'luxon';
import { useTheme } from '@/composables/useTheme';
import FullCalendar from '@fullcalendar/vue3'
import { ModalsContainer, useModal } from 'vue-final-modal'
import FilterModal from './FilterModal.vue'
import EventModal from './EventModal.vue'
import EventTooltip from './EventTooltip.vue'
import DraggableEventWindow from './DraggableEventWindow.vue'
import { clientCacheMaxAgeSeconds, clientStaleWhileInvalidateSeconds } from '~~/utils/util';
import { replaceBadgePlaceholders } from '~~/utils/util';
import { type CalendarOptions, type EventClickArg, type EventSourceInput } from '@fullcalendar/core/index.js';
import eventSourcesJSON from '@/assets/event_sources.json';
import { getAllTags } from '@/server/tagsListServe'; //Function that gives all tags utilized from event_sources.json



const clickedEvent: Ref<EventClickArg | null> = ref(null); // For storing the clickedEvent data
const calendarRef = ref(null); // Ref for the FullCalendar instance

// Tooltip state
const tooltipVisible = ref(false);
const tooltipEvent = ref(null);
const tooltipX = ref(0);
const tooltipY = ref(0);
let tooltipTimeout = null;

// Free drag mode state
const isFreeDragMode = ref(false);
const draggableWindows = ref(new Map());
let windowCounter = 0;

// Handle tooltip mouse events
const handleTooltipEnter = () => {
  // Clear any pending hide timeout when mouse enters tooltip
  if (tooltipTimeout) {
    clearTimeout(tooltipTimeout);
    tooltipTimeout = null;
  }
};

const handleTooltipLeave = () => {
  // Hide tooltip when mouse leaves tooltip
  tooltipVisible.value = false;
};
const tags = ref(getAllTags()); // Ref for serving a full list of tags found in event_sources.json
provide('tags', tags); //Serves the tags array globally, allowing it to be accessed in FilterModal.vue

var beforeMOTDDate = (Date.now() < Date.parse('11/02/2024 2:30:00 PM'));//For hiding the MOTD, a better system will be implemented in the future!

const tagsToHide = ['hidden', 'internal', 'invisible']; // Tags that should hide events

const { theme } = useTheme();
watch(theme, () => {
  nextTick(() => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        moveListViewScrollbarToTodayAndColor();
      });
    });
  });
});
const headImage = ref('');

const getWindowHeight = () => {
  if (process.client) return window.innerHeight;
  return 600;
};

const getWindowWidth = () => {
  if (process.client) return window.innerWidth;
  return 350;
};

const calendarHeight = useCookie('calendarHeight', {
  sameSite: 'strict',
  default: () => 2000, maxAge: 60 * 60 * 24 * 365
});
if (process.client) calendarHeight.value = window.innerHeight;
const pageWidth = useCookie('pageWidth', {
  sameSite: 'strict',
  default: () => 1000, maxAge: 60 * 60 * 24 * 365
});
if (process.client) pageWidth.value = window.innerWidth;

const isUsingDayMaxEventRows = useState('isUsingDayMaxEventRows', () => true);

const updateWeekNumbers = () => {
  return getWindowWidth() < 350 ? false : true
};
// -1 indicates that there is no limit.
const updateDayMaxEventRows = () => { return isUsingDayMaxEventRows.value ? -1 : Math.floor(getWindowHeight() / 75) };

const calendarOptions = ref<CalendarOptions | undefined>()

const disabledEventSources = new Map<string, EventSourceInput>()

function enableEventSource(name: string) {
  if (!calendarOptions.value?.eventSources) return
  if (calendarOptions.value.eventSources.some(eventSource => name === eventSource.name)) return
  const source = disabledEventSources.get(name)
  if (source) calendarOptions.value.eventSources.push(source)
}

function disableEventSource(name: string) {
  if (!calendarOptions.value?.eventSources) return
  const newEventSources: EventSourceInput[] = []

  calendarOptions.value.eventSources.forEach(eventSource => {
    if (name === eventSource.name) {
      disabledEventSources.set(name, eventSource)
    } else {
      newEventSources.push(eventSource)
    }
  })

  calendarOptions.value.eventSources = newEventSources
}

function isDisplayingBasedOnTags(event) {
  let shouldHidefromHidden = false; // Whether the event should be hidden due to it having a tag with isHidden set to true
  let shouldShowfromHeader = false; // Whether the event contains a tag of a tagHeader whis isVisible, which is a pre-requisite to being visible
  let shouldShowfromTags = false; //Whether the event contains atleast one tag which is being searched for rn, has to be true.
  // Iterate over all tags of the event
  event.tags?.forEach(tagEvent => {
    tags.value.forEach(tagFilter => {
      if (tagFilter.isHidden && tagEvent === tagFilter.name) { shouldHidefromHidden = true; } // This tag dictates the event should be hidden
      if (tagFilter.isHeader && tagEvent === tagFilter.name && tagFilter.isVisible) { shouldShowfromHeader = true; } // This tag is a header and is required to show the event
      if (tagEvent === tagFilter.name && tagFilter.isVisible && !tagFilter.isHeader) { shouldShowfromTags = true; } // This tag allows the event to be shown
    });
  });

  // Determine the final display status based on the conditions evaluated
  return ((shouldShowfromHeader && shouldShowfromTags) && !shouldHidefromHidden) ? 'list-item' : 'none';
}

const updateDisplayingBasedOnTags = () => { //Function that re-renders the calendar by updating the display value of each event and resetting it altogether
  // Map over eventSources to create a new array with updated items
  const updatedEventSources = calendarOptions.value.eventSources.map(source => {
    const events = source.events?.map(event => ({
      ...event,
      display: isDisplayingBasedOnTags(event)
    })) || source.events;

    return { ...source, events };
  });

  // Replace the original eventSources with the new array to trigger reactivity
  calendarOptions.value.eventSources = updatedEventSources;
};

const { open: openFilterModal, close: closeFilterModal } = useModal({
  component: FilterModal,
  attrs: {
    enableEventSource,
    disableEventSource,
    onConfirm() {
      updateDisplayingBasedOnTags();
      moveListViewScrollbarToTodayAndColor();
      closeFilterModal();
    },
  },
})

const { open: openEventModal, close: closeEventModal } = useModal({
  component: EventModal,
  attrs: {
    event: clickedEvent,
    onConfirm() {
      closeEventModal()
    },
    onTagClick(tag: string) {
      handleTagClick(tag);
    },
  },
})

// Free drag window management
const createDraggableWindow = (event, x, y) => {
  const windowId = `window-${++windowCounter}`;
  draggableWindows.value.set(windowId, {
    event: event.event,
    x: x,
    y: y,
    id: windowId
  });
};

const closeDraggableWindow = (windowId) => {
  draggableWindows.value.delete(windowId);
};

// Handle tag clicks from modals and draggable windows
const handleTagClick = (tag: string) => {
  // Find the tag in the tags array and set it as visible
  const tagToShow = tags.value.find(t => t.name === tag);
  if (tagToShow) {
    if (tagToShow.isHeader) {
      // If clicking a header tag, hide all other header tags but show all non-header tags
      tags.value.forEach(t => {
        if (t.isHeader) {
          t.isVisible = (t.name === tag); // Only show the clicked header tag
        } else {
          t.isVisible = true; // Show all non-header tags
        }
      });
    } else {
      // If clicking a non-header tag, hide all non-header tags except the clicked one
      tags.value.forEach(t => {
        if (!t.isHeader) {
          t.isVisible = false;
        }
      });
      
      // Show the clicked tag
      tagToShow.isVisible = true;
      
      // Ensure all header tags are visible (community, non-profit, etc.)
      tags.value.forEach(t => {
        if (t.isHeader) {
          t.isVisible = true;
        }
      });
    }
    
    // Update the calendar display
    updateDisplayingBasedOnTags();
    moveListViewScrollbarToTodayAndColor();
  }
};

const closeAllDraggableWindows = () => {
  draggableWindows.value.clear();
};

// Toggle free drag mode
const toggleFreeDragMode = () => {
  isFreeDragMode.value = !isFreeDragMode.value;
  if (!isFreeDragMode.value) {
    closeAllDraggableWindows();
  }
  
  // Update button appearance
  nextTick(() => {
    const freeDragButton = document.querySelector('.fc-freeDrag-button');
    if (freeDragButton) {
      if (isFreeDragMode.value) {
        freeDragButton.classList.add('fc-button-active');
      } else {
        freeDragButton.classList.remove('fc-button-active');
      }
    }
  });
};

calendarOptions.value = {
  plugins: [dayGridPlugin, timeGridPlugin, listPlugin],
  initialView: getWindowWidth() <= 600 ? 'listMonth' : 'dayGridMonth',
  customButtons: {
    less: {
      text: 'less',
      click: function () {
        isUsingDayMaxEventRows.value = !isUsingDayMaxEventRows.value;
        calendarOptions.value = {
          ...calendarOptions.value,
          dayMaxEventRows: updateDayMaxEventRows()
        };
      }
    },
    filter: {
      text: 'filter',
      click: openFilterModal,
    },
    freeDrag: {
      text: 'free drag',
      click: toggleFreeDragMode,
    },
  },
  headerToolbar: {
    left: 'prev today filter freeDrag',
    center: 'title',
    right: 'dayGridMonth,listMonth next'
  },
  buttonText: {
    month: 'grid', // Feels clearer than 'month' and 'list'
    list: 'list'
  },
  nowIndicator: true,
  height: '100vh',
  dayMaxEventRows: updateDayMaxEventRows(),
  navLinks: true,
  weekNumbers: updateWeekNumbers(),
  eventSources: [],

  eventClick: function (event) {
    event.jsEvent.preventDefault(); // Prevent the default behavior of clicking a link
    
    if (isFreeDragMode.value) {
      // Create draggable window at click position
      createDraggableWindow(event, event.jsEvent.clientX, event.jsEvent.clientY);
    } else {
      // Use normal modal
      clickedEvent.value = event;
      openEventModal();
    }
  },

  eventMouseEnter: function(info) {
    // Clear any existing timeout
    if (tooltipTimeout) {
      clearTimeout(tooltipTimeout);
    }
    
    // Show tooltip after a short delay
    tooltipTimeout = setTimeout(() => {
      tooltipEvent.value = info.event;
      tooltipX.value = info.jsEvent.clientX;
      tooltipY.value = info.jsEvent.clientY;
      tooltipVisible.value = true;
    }, 500); // 500ms delay
  },

  eventMouseLeave: function() {
    // Clear timeout and hide tooltip
    if (tooltipTimeout) {
      clearTimeout(tooltipTimeout);
      tooltipTimeout = null;
    }
    // Don't immediately hide - let tooltip mouse events handle it
    tooltipTimeout = setTimeout(() => {
      tooltipVisible.value = false;
    }, 300); // Longer delay to allow moving to tooltip
  },

  progressiveEventRendering: true, // More re-renders; not batched. Needs further testing.
  stickyHeaderDates: false,
  // Event handlers.
  // Move the scrollbar to today when the switching from other views.
  viewDidMount: moveListViewScrollbarToTodayAndColor,
  // eventDidMount: moveListViewScrollbarToTodayAndColor,

  eventContent: function(arg) {
    // Ensure you use v-html in your FullCalendar component to render HTML content
    // Format the start time and title as desired
    let startTime = '';
    if (arg.event.start) {
      // Use Luxon to format the time
      let startDateTime = DateTime.fromJSDate(arg.event.start);
      // Format the time to show "7p" for 19:00 and "5:30a" for 05:30
      startTime = startDateTime.toFormat('h:mma').toLowerCase(); // Converts to "7:00pm" or "5:30am"
      // Remove the leading "0" for times like "07:00pm", remove ":00" for whole hours, and remove "m" to return to it's previous format
      startTime = startTime.replace(/^0/, '').replace(':00', '').replace('m','');
    }
    let title = replaceBadgePlaceholders(arg.event.title);
    let contentHtml;
    if (arg.view.type != 'listMonth') {
      contentHtml = `<div class="fc-daygrid-event-dot" style="display: inline-block; vertical-align: middle; margin-right: 4px; position: relative; top: -1px;"></div><span class="fc-event-time" style="margin-right: 0px;">${startTime}</span> <span class="fc-event-title">${title}</span>`;
    }
    else {
      contentHtml = `<a href="${arg.event.url}" class="fc-event-link" style="text-decoration: none; color: inherit;"><span class="fc-event-title">${title}</span></a>`;
    }
    return { html: contentHtml };
  },
};

const updateCalendarHeight = () => {
  pageWidth.value = getWindowWidth();
  calendarHeight.value = getWindowHeight();
  calendarOptions.value = {
    ...calendarOptions.value,
    weekNumbers: getWindowWidth() < 350 ? false : true,
    dayMaxEventRows: updateDayMaxEventRows()
  };
};

function moveListViewScrollbarToTodayAndColor(retryCount = 5) {//Default retry count set to 5
  const listMonthViewScrollerClass = '.fc-scroller.fc-scroller-liquid';
  const dayGridMonthViewScrollerClass = '.fc-scroller.fc-scroller-liquid-absolute';

  const isInListMonthView = document.querySelector(listMonthViewScrollerClass) !== null;
  const isInDayGridMonthView = document.querySelector(dayGridMonthViewScrollerClass) !== null;

  const isInCurrentMonth = document.querySelector('.fc-list-day.fc-day.fc-day-today') !== null;

  if (isInListMonthView && isInCurrentMonth) {
    const today = document.querySelector('.fc-list-day.fc-day.fc-day-today');
    if (today.length <= 0) return;
    today?.scrollIntoView({ behavior: 'instant', block: 'start', inline: 'nearest' });
    window.scrollTo(0, 0);
    // const todayY = today!.getBoundingClientRect().top;
    // const goToY = Math.min(todayY, todayY);
    // const listMonthViewScroller = document.querySelector(listMonthViewScrollerClass);
    // listMonthViewScroller!.scrollTop = goToY;

    // Old.
    // const today = '.fc-list-day.fc-day.fc-day-today';
    // const scrollLength = $('.fc-scroller.fc-scroller-liquid').prop("scrollHeight");
    // $('.fc-scroller.fc-scroller-liquid').scrollTop(Math.min($(today).position().top, scrollLength));
    nextTick(() => {
        // Fetch the value of --background-today from CSS
        const backgroundToday = getComputedStyle(document.documentElement).getPropertyValue('--background-today').trim();
        // Verify that backgroundToday is not the default or previous value
        if (backgroundToday && backgroundToday !== "#defaultOldValue") {
            // Code to apply the backgroundToday color
            const today = document.querySelector('.fc-day.fc-day-today');
            // Change today element's --fc-neutral-bg-color to backgroundToday.
            today?.style.setProperty('--fc-neutral-bg-color', backgroundToday);
        } else if (retryCount > 0) {
            // If the color hasn't updated, try again after another frame
            window.requestAnimationFrame(() => {
                moveListViewScrollbarToTodayAndColor(retryCount - 1);// Calls the function again until retrycount is 0 (which will then skip this portion)
            });
        }
    });

  }
  else if (isInDayGridMonthView) {
    const today = $('.fc-day.fc-day-today.fc-daygrid-day');
    if (today.length <= 0) return;
    const scrollLength = $('.fc-scroller.fc-scroller-liquid-absolute').prop("scrollHeight");
    $(dayGridMonthViewScrollerClass).scrollTop(Math.min($(today).position().top, scrollLength));
  }
}

async function getEventSources() {
  const endpoints = eventSourcesJSON.appConfig.eventApiToGrab;
  const clientHeaders = {
    'Cache-Control': `max-age=${clientCacheMaxAgeSeconds}, stale-while-revalidate=${clientStaleWhileInvalidateSeconds}`,
  };

  console.log('[App] Fetching from endpoints:', endpoints);
  console.log('[App] Instagram endpoint included?', endpoints.includes('/api/events/instagram'));

  // Fetch all event sources normally - Instagram endpoint now loads from static data
  const results = await Promise.allSettled(endpoints.map(async (endpoint) => {
    console.log(`[App] Starting fetch from endpoint: ${endpoint}`);
    try {
      const { data, error } = await useLazyFetch(endpoint, { headers: clientHeaders });
      console.log(`[App] Response from ${endpoint}:`, data.value);
      console.log(`[App] Error from ${endpoint}:`, error.value);
      if (error.value) {
        console.error(`[App] Fetch error for ${endpoint}:`, error.value);
        return null;
      }
      return addEventSources(transformEventSourcesResponse(data));
    } catch (error) {
      console.error(`[App] Error fetching from ${endpoint}:`, error);
      return null;
    }
  }));
  
  console.log('[App] All fetch results:', results);
}

// Multiple re-renders (which may be unrelated to the fetching) cause this to be called multiple times.
getEventSources();
// A hack to move the scrollbar to today after mounting- it is inconsistent otherwise on mobile.
if (process.client)
  setTimeout(moveListViewScrollbarToTodayAndColor, 0);

onMounted(() => {
  window.addEventListener("resize", updateCalendarHeight);
  moveListViewScrollbarToTodayAndColor();
  // Expose the calendar instance to the window object for debugging
  if (calendarRef.value) window.myCalendar = calendarRef.value.getApi();
  //For the headImage rendering
  /*async function fetchBrick() {
    const svgResponse = await fetch('/css/triad-build.svg');
    headImage.value = await svgResponse.text();
  }
  fetchBrick();*/
  headImage.value = '/css/triad-build-pixel.png';
});
onUpdated(() => {
});
onUnmounted(() => {
  if (process.client) window.removeEventListener('resize', updateWeekNumbers)
});

// Updates calendarOptions' eventSources and triggers a re-render of the calendar.
function addEventSources(newEventSources: EventNormalSource[] | EventGoogleCalendarSource[]) {
  // Cut out events without times, but typecheck for types that can have invalid times.
  newEventSources = newEventSources.map(eventSource => {
    // Skip events that can't be invalid.
    if (eventSource.events === undefined) return eventSource;

    // Filter events.
    const updatedEvents = new Array();
    eventSource.events.forEach((event) => {
      /* REMOVED TEMPORARILY, replaced with the hack below: Remove events that last longer than 3 days.
      Note: This also tends to cut out Eventbrite events that have 'Multiple Dates' over a range of 3 days.
      Using the official Eventbrite API would allow us to avoid this issue, but would potentially run into 
      rate limits pretty quickly during peak hours. */
      const lengthInDays = Math.round((event.end.getTime() - event.start.getTime()) / (1000 * 3600 * 24));

      if (lengthInDays <= eventDayDurationSplitThreshold) {
        updatedEvents.push(event);
      }
      else {
        // Split the event into multiple day-long events.
        // for (let i = 0; i < lengthInDays; i++) {
          // Temporarily just split into the first day and last day. TODO: Change this to split into individual days.
        for (let i = 0; i < lengthInDays; i += lengthInDays - 1) {

          let currentDayStart = DateTime.fromJSDate(event.start, { zone: 'utc' });
          // Set currentDayEnd to start's day, but end's hour and minute.
          let currentDayEnd = DateTime.fromJSDate(event.end, { zone: 'utc' }).set({ month: currentDayStart.month, day: currentDayStart.day }).plus({ days: i });
          currentDayStart = currentDayStart.plus({ days: i });

          // // Adjust for end time being before start time.
          if (currentDayEnd < currentDayStart) {
            currentDayEnd.plus({ days: 1 });
          }

          // If set to all-day, set start to 0 and end to 23:59 in America/Los_Angeles time, to correct inaccurate times.
          if (event.allDay) {
            currentDayStart = currentDayStart.setZone('America/Los_Angeles').set({ hour: 0, minute: 0 }).toUTC();
            currentDayEnd = currentDayEnd.setZone('America/Los_Angeles').set({ hour: 23, minute: 59 }).toUTC();
          }

          const newSplitEvent = {
            ...event,
            // allDay: false,
            // title: `${event.title} (Day (${i + 1}/${lengthInDays})`,
            title: `${event.title} (${i === lengthInDays ? 'Last' : 'First'} Day)`,
            start: currentDayStart.toJSDate(),
            // Use the end time's hour and minute.
            end: currentDayStart.toJSDate(),
          };
          updatedEvents.push(newSplitEvent);
        }
      }
    });

    return {
      ...eventSource,
      events: updatedEvents,
      // events: newEvents,
    } as EventNormalSource;
  });
  // Issue: might take a long time to actually update the calendar if the list of, for example, Eventbrite events/sources is large.

  calendarOptions.value = {
    ...calendarOptions.value,
    eventSources: calendarOptions.value?.eventSources?.concat(newEventSources)
  };

  return calendarOptions.value
}

const transformEventSourcesResponse = (eventSources: Ref<Record<string, any>>) => {
  const eventsSourcesWithoutProxy = toRaw(eventSources.value.body)
  if (!eventsSourcesWithoutProxy || eventsSourcesWithoutProxy.length < 1) return [];
  const datesAdded = eventsSourcesWithoutProxy.map(eventSource => {
    return {
      ...eventSource,
      // Set the `display` property, since the endpoints don't add it.
      events: eventSource.events.map(event => {
        return {
          ...event,
          // Convert date strings to Date objects.
          start: new Date(event.start),
          end: new Date(event.end),
          display: isDisplayingBasedOnTags(event)
        }
      })
    }
  })
  return datesAdded;
}

</script>

<template>
  <ModalsContainer />
  <EventTooltip 
    :event="tooltipEvent" 
    :visible="tooltipVisible" 
    :x="tooltipX" 
    :y="tooltipY" 
    @tooltip-enter="handleTooltipEnter"
    @tooltip-leave="handleTooltipLeave"
  />
  
  <!-- Draggable Windows -->
  <DraggableEventWindow
    v-for="window in draggableWindows.values()"
    :key="window.id"
    :event="window.event"
    :window-id="window.id"
    :initial-x="window.x"
    :initial-y="window.y"
    @close="closeDraggableWindow"
    @minimize="() => {}"
    @tag-click="handleTagClick"
  />
  <div class="calendar-container">
    <table style="width:100%;">
      <tbody>
        <tr>
          <td class="blurb-image"> <img :src="headImage" alt="Triad Build Logo" style="max-width: 100%; height: auto;" /><!--<div v-html="headImage"></div>--> </td>
          <td>
            <div class="blurb-text">
              A communal board for fun GSO events
            </div>
            <div class="blurb-sub">
              Stop scrolling insta to find the move!<br><br>
              
            </div>
          </td>
        </tr>
      </tbody>
    </table>
    <div style="text-align: center;" v-if="beforeMOTDDate">
      <div class="motd">
        🇵🇸 This Saturday ShutItDown4Palestine is hosting a national day of action to say
        NO VOTES FOR GENOCIDE. Want to join in RVA? Check out the upcoming rally 
        <a style="color: var(--text-white);" href="https://www.instagram.com/pslvirginia/p/DBobeMEuC8D/">here!</a> 🇵🇸 
        <br > 🗓️ Nov 2 | 🕑 2pm | 📍 Monroe Park
      </div>
    </div>
    <FullCalendar ref="calendarRef" :options='calendarOptions' />
    <div style="display: flex; align-items: center; flex-direction: row;">
      <div class="desc" style="padding-bottom: 0;">
        <p>triad.build is a forever free commual calendar for folks to find and create community! As a new GSOer I hope to connect with you in this way too :P. The events here are drawn from various 
          <a href="/sources">organizer listings</a> that
          contributors have provided. <span style="color:red">(We are looking for more! Plz join!)</span> I hope you be encouraged to build your own community too! If you'd like to become
          a contributor of events, check out our contributing guide <a href="/contributing">here</a>! The events presented here are in a constant state of community-based vetting; don't hesitate to provide feedback! For suggestions and questions
          email <a href="mailto:leileixiawork@gmail.com">leileixiawork@gmail.com</a> </p>
          <p>You can hover your mouse to preview an event, and by clicking the "free drag" on the top menu, you will be able to see events like little windows to compare the time and details. Click "add to calendar" to generate .ics file that could be added to your system calendar.</p>

        <p>Before making plans, consider checking with venue staff or event organizers directly. This site is NOT
          affiliated with any events listed so information could possibly be outdated. Click on the "event url" to get direct information!</p>

        <p> Check out our sibling sites <a href="https://anarchism.nyc/">anarchism.nyc</a>, 
        <a href="https://bay.lgbt/">bay.lgbt</a>, and <a href="https://anarchism.boston/">anarchism.boston</a>, <a href="https://rva.rip/">rva.rip</a>.
        This site is a fork from rva.rip, which is forked from the other predecessors. triad.build wouldn't exist without them, and we're all run by LGBTQA+ folks.</p>
        <p>Want your event listed here? Start making a <a href="/contributing">public google calendar</a> for your events. 
          Once published, request inclusion of your event feed by sending your Google Calendar ID via a 
          <a href="https://github.com/lilyxia99/triad.build/issues">new GitHub issue</a> or by emailing me at leileixiawork@gmail.com! If you have an eventbrite page you would like to add, send them through the same way--although those are scraped so the display might not be ideal, so I always would recommend google calendar!
          You may also provide feedback, fixes, or improvements through either means</p>
      </div>
    </div>
    <Footer />
  </div>
</template>
