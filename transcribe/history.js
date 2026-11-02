/* Chat history. The clock opens a sheet listing every chat, newest first, and
   a row loads that chat into the conversation; the plus starts an empty one.
   The chat already in the markup is the newest; the rest are seeded here. A
   chat's title stands in for one the assistant would write from what was
   said. */
(function () {
  var screen = document.querySelector('.transcribe');
  var thread = screen.querySelector('.transcribe__thread');
  var body = screen.querySelector('.pp-screen__body');
  var opener = screen.querySelector('.transcribe__history');
  var fresh = screen.querySelector('.transcribe__new');
  var sheet = screen.querySelector('.transcribe__sheet');
  var list = sheet.querySelector('.transcribe__chats');
  var closer = sheet.querySelector('.transcribe__sheet-close');
  var backdrop = sheet.querySelector('.transcribe__backdrop');
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  // [days ago, time, title, messages], newest first; the list keeps this
  // order. A message is [who, text], and an assistant reply may carry a
  // list: [who, before, [items], after].
  var SEED = [
    [1, '4:40 PM', 'Mowing route for next week', [
      ['pro', 'Can you line up my mowing route for next week?'],
      ['agent', 'Here’s the route, grouped by neighborhood:', ['Monday: Brookside, 6 lawns', 'Tuesday: Maple Ave and Elm Ct, 5 lawns', 'Thursday: Riverside, 7 lawns'], 'Want me to send each customer their day?'],
      ['pro', 'Yes, send them'],
      ['agent', 'Done. 18 customers got their mowing day for next week.'],
    ]],
    [1, '7:55 AM', 'Rain delay for the Okafor sod', [
      ['pro', 'Rain all day tomorrow. What should I move?'],
      ['agent', 'The Okafor sod install is the only outdoor job that can’t run in the rain. I can move it to Thursday at 9:00 AM, which is open.'],
      ['pro', 'Do it and let them know'],
      ['agent', 'Moved to Thursday at 9:00 AM. I messaged the Okafors about the weather.'],
    ]],
    [2, '6:12 PM', 'Mulch order for the Whitfield beds', [
      ['pro', 'How much mulch do I need for Dana Whitfield’s front beds? About 300 sq ft at 3 inches'],
      ['agent', 'That’s about 2.8 cubic yards. Round up to 3 to cover settling.'],
      ['pro', 'Add it to her quote at $45 a yard'],
      ['agent', 'Added 3 yards of mulch for $135. Her new total is $1,215.'],
    ]],
    [3, '11:20 AM', 'Reply to a new lead in Riverside', [
      ['pro', 'Who’s the new lead from this morning?'],
      ['agent', 'Tom Becker in Riverside wants a spring cleanup and gutter clearing. He asked for a price by Friday.'],
      ['pro', 'Tell him I can come by Wednesday afternoon to look'],
      ['agent', 'Sent. I offered Wednesday between 1:00 and 4:00 PM.'],
    ]],
    [4, '3:05 PM', 'Last month’s earnings', [
      ['pro', 'How did September compare to August?'],
      ['agent', 'You earned $18,420 in September, up 14% from August. Fall cleanups and aeration drove most of it.'],
    ]],
    [5, '9:47 AM', 'Hedge trimming quote for the Nguyens', [
      ['pro', 'Draft a quote for the Nguyens. 12 boxwoods and a 40 ft privet hedge'],
      ['agent', 'Here’s a draft:', ['Boxwood shaping, 12 shrubs: $240', 'Privet hedge, 40 ft: $320', 'Haul-away: $60'], 'Total: $620. Send it now?'],
      ['pro', 'Send it'],
      ['agent', 'Sent to Linh Nguyen.'],
    ]],
    [6, '1:30 PM', 'Crew schedule for Saturday', [
      ['pro', 'Who’s working Saturday?'],
      ['agent', 'Andre and Sam are on. Jess asked for the day off last week.'],
      ['pro', 'Put Andre on the Shah patio prep'],
      ['agent', 'Andre is on the Shah patio prep at 8:00 AM Saturday.'],
    ]],
    [8, '10:02 AM', 'Overdue invoice from the Parks', [
      ['pro', 'Any invoices past due?'],
      ['agent', 'One. The Parks owe $460 for the September cleanup, 12 days late.'],
      ['pro', 'Send a friendly reminder'],
      ['agent', 'Reminder sent with a link to pay by card.'],
    ]],
    [9, '5:18 PM', 'Aeration openings in October', [
      ['pro', 'How many aeration slots do I have left in October?'],
      ['agent', 'You have 9 open slots, mostly on weekday afternoons in the second half of the month.'],
      ['pro', 'Offer them to last year’s aeration customers'],
      ['agent', 'Sent to 23 customers. I’ll book them as replies come in.'],
    ]],
    [11, '8:40 AM', 'Retaining wall estimate for Elena Ruiz', [
      ['pro', 'What should I charge Elena Ruiz for a 30 ft retaining wall?'],
      ['agent', 'For a 3 ft block wall, jobs like yours run $35 to $50 a face foot. At 90 face feet, that’s $3,150 to $4,500.'],
      ['pro', 'Use $42'],
      ['agent', 'Drafted at $3,780. I’ll hold it until after your site visit.'],
    ]],
    [13, '2:25 PM', 'Fall cleanup reminders', [
      ['pro', 'Remind my regulars that fall cleanup booking is open'],
      ['agent', 'Sent to 41 regular customers, with your open dates through November 15.'],
    ]],
    [15, '12:10 PM', 'Fuel and equipment costs', [
      ['pro', 'What did I spend on fuel and equipment this month?'],
      ['agent', 'Fuel was $612 and equipment repairs were $380, for $992 in total. That’s about 6% of revenue.'],
    ]],
    [18, '9:15 AM', 'Sprinkler winterizing for the Lees', [
      ['pro', 'Marcus Lee wants his sprinklers winterized. When can I fit it in?'],
      ['agent', 'You’re near Brookside on October 30. I can add him at 2:00 PM.'],
      ['pro', 'Book it'],
      ['agent', 'Booked for October 30 at 2:00 PM. Marcus has been told.'],
    ]],
    [20, '4:50 PM', 'Review request after the Shah job', [
      ['pro', 'Ask Priya Shah for a review'],
      ['agent', 'Sent. I thanked her for the referral and linked your profile.'],
      ['pro', 'Did she leave one?'],
      ['agent', 'Yes, 5 stars: “On time, tidy, and the patio looks amazing.”'],
    ]],
    [22, '7:30 AM', 'Leaf removal for Maple Ave', [
      ['pro', 'Group the Maple Ave leaf jobs into one day'],
      ['agent', 'All 5 Maple Ave leaf jobs are now on Tuesday, starting at 8:00 AM, about 40 minutes each.'],
    ]],
    [25, '3:40 PM', 'Price for a paver patio', [
      ['pro', 'What do pros near me charge for a paver patio?'],
      ['agent', 'Most pros near you charge $28 to $34 a square foot, installed. You’ve been quoting $30.'],
      ['pro', 'Keep it at $30'],
      ['agent', 'Got it. I’ll keep using $30 a square foot for patio quotes.'],
    ]],
    [27, '10:55 AM', 'Weekly mowing for Brookside', [
      ['pro', 'Any new mowing requests in Brookside?'],
      ['agent', 'Two: Marcus Lee and Grace Kim, both weekly. Your Monday route has room for both.'],
      ['pro', 'Add them both to Mondays'],
      ['agent', 'Added. Both start next Monday.'],
    ]],
    [30, '6:05 PM', 'Customer notes for Dana Whitfield', [
      ['pro', 'Note that Dana Whitfield’s gate code is 4471 and her dog is friendly'],
      ['agent', 'Saved to Dana’s customer notes. Your crew will see it on her jobs.'],
    ]],
    [33, '1:15 PM', 'Seed and fertilizer order', [
      ['pro', 'Order seed and fertilizer for the overseeding jobs'],
      ['agent', 'For 8 jobs covering about 42,000 sq ft, you need:', ['Tall fescue seed: 9 bags', 'Starter fertilizer: 6 bags'], 'Want me to send this to your supplier?'],
      ['pro', 'Yes'],
      ['agent', 'Order sent to Green Valley Supply for pickup Thursday.'],
    ]],
    [36, '9:30 AM', 'Stump grinding add-on', [
      ['pro', 'The Okafors want a stump ground out too. How much should I add?'],
      ['agent', 'For one stump about 18 inches across, $150 to $200 is typical near you.'],
      ['pro', 'Add $175'],
      ['agent', 'Added stump grinding for $175 to the Okafor quote.'],
    ]],
    [40, '2:45 PM', 'Slow week ahead', [
      ['pro', 'Next week looks slow. Any ideas?'],
      ['agent', 'You have 11 hours open. I can offer gutter cleaning to customers who booked it last fall, which filled 8 slots last year.'],
      ['pro', 'Go for it'],
      ['agent', 'Sent to 17 customers. 3 have booked so far.'],
    ]],
    [44, '11:00 AM', 'Profile photos update', [
      ['pro', 'Add the Shah patio photos to my profile'],
      ['agent', 'Added 4 photos to your profile under Hardscaping.'],
    ]],
    [48, '8:20 AM', 'Hiring a seasonal helper', [
      ['pro', 'I need a seasonal helper through November. What should I pay?'],
      ['agent', 'Seasonal landscaping helpers near you earn $18 to $22 an hour. Offering $20 puts you in the middle.'],
    ]],
    [53, '5:35 PM', 'Gutter cleaning for the Parks', [
      ['pro', 'The Parks want gutters cleaned. Fit them in this week'],
      ['agent', 'Thursday at 3:00 PM is open and you’re nearby. Booked, and the Parks have been told.'],
    ]],
  ];

  function bubble(who, parts) {
    var item = document.createElement('li');
    var pro = who === 'pro';
    item.className = 'transcribe__message transcribe__message--' + (pro ? 'pro' : 'agent');
    item.dataset.ppComponent = 'Bubble / Text';
    item.dataset.ppVariant = 'Theme=' + (pro ? 'Sender' : 'Recipient') + ', Length=Long, Interaction=Initial';
    if (pro) item.dataset.ppContent = 'pro';
    var box = document.createElement(parts.length > 1 ? 'div' : 'p');
    box.className = 'pp-body-2 transcribe__bubble';
    if (parts.length === 1) {
      box.textContent = parts[0];
    } else {
      parts.forEach(function (part) {
        if (!part) return;
        var node;
        if (Array.isArray(part)) {
          node = document.createElement('ul');
          part.forEach(function (line) {
            var li = document.createElement('li');
            li.textContent = line;
            node.appendChild(li);
          });
        } else {
          node = document.createElement('p');
          node.textContent = part;
        }
        box.appendChild(node);
      });
    }
    item.appendChild(box);
    return item;
  }

  var chats = [{ title: 'Okafor reschedule, Priya’s quote and leads', nodes: null }].concat(
    SEED.map(function (entry) {
      return { title: entry[2], messages: entry[3] };
    })
  );
  chats[0].nodes = Array.prototype.slice.call(thread.children);
  var active = chats[0];

  function show(chat) {
    active = chat;
    if (!chat) {
      thread.replaceChildren();
      return;
    }
    if (!chat.nodes) {
      chat.nodes = chat.messages.map(function (message) {
        return bubble(message[0], message.slice(1));
      });
    }
    thread.replaceChildren.apply(thread, chat.nodes);
    body.scrollTop = body.scrollHeight;
  }

  function renderList() {
    list.replaceChildren.apply(list, chats.map(function (chat) {
      var item = document.createElement('li');
      var row = document.createElement('button');
      row.type = 'button';
      row.className = 'transcribe__chat';
      if (chat === active) row.setAttribute('aria-current', 'true');
      var title = document.createElement('span');
      title.className = 'pp-body-1 transcribe__chat-title';
      title.textContent = chat.title;
      row.append(title);
      row.addEventListener('click', function () {
        show(chat);
        close();
      });
      item.appendChild(row);
      return item;
    }));
  }

  // Everything behind the sheet is inert while it is up, so focus and
  // screen readers stay inside it.
  var behind = Array.prototype.filter.call(screen.children, function (child) {
    return child !== sheet;
  });
  var panel = sheet.querySelector('.transcribe__sheet-panel');
  var closing = 0;
  // Focus goes back to the clock only when the sheet was opened from the
  // keyboard; after a tap it would only draw a ring nobody asked for.
  var byKeyboard = false;

  function open(event) {
    byKeyboard = !!event && event.detail === 0;
    window.clearTimeout(closing);
    renderList();
    document.activeElement && document.activeElement.blur && document.activeElement.blur();
    sheet.hidden = false;
    // A just-shown element has no prior style to transition from; the read
    // forces one to be computed before the state flips.
    void sheet.offsetHeight;
    sheet.setAttribute('data-open', '');
    behind.forEach(function (child) { child.inert = true; });
    list.scrollTop = 0;
    panel.focus({ preventScroll: true });
  }

  function close() {
    if (!sheet.hasAttribute('data-open')) return;
    sheet.removeAttribute('data-open');
    behind.forEach(function (child) { child.inert = false; });
    if (byKeyboard) opener.focus({ preventScroll: true });
    else if (sheet.contains(document.activeElement)) document.activeElement.blur();
    var duration = reduced.matches ? 0 : parseFloat(getComputedStyle(panel).transitionDuration) * 1000;
    closing = window.setTimeout(function () {
      if (!sheet.hasAttribute('data-open')) sheet.hidden = true;
    }, duration);
  }

  opener.addEventListener('click', open);
  closer.addEventListener('click', close);
  backdrop.addEventListener('click', close);
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && sheet.hasAttribute('data-open')) close();
  });

  fresh.addEventListener('click', function () {
    show(null);
  });

  // Where the screen is one page of several, leaving it puts the sheet away.
  new MutationObserver(function () {
    if (!screen.hidden) return;
    window.clearTimeout(closing);
    sheet.removeAttribute('data-open');
    sheet.hidden = true;
    behind.forEach(function (child) { child.inert = false; });
  }).observe(screen, { attributes: true, attributeFilter: ['hidden'] });
})();
