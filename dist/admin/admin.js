'use strict';

const stages = {
  new: 'Novo lead',
  conversation: 'Conversa iniciada',
  follow_up: 'Em seguimento',
  scheduled: 'Agendamento feito',
  completed: 'Sessão realizada',
  lost: 'Encerrado',
};
const appointmentStages = ['scheduled', 'completed'];
const appointmentStatuses = { scheduled: 'Agendado', completed: 'Realizado', cancelled: 'Cancelado' };
const qualifications = {
  unrated: 'Por qualificar',
  cold: 'Frio',
  warm: 'Morno',
  hot: 'Quente',
};
const qualificationHints = {
  unrated: 'Ainda não há informação suficiente para avaliar o interesse.',
  cold: 'Mostrou interesse genérico, sem intenção ou prazo definido.',
  warm: 'Pediu informações sobre um serviço ou preço, sem avançar para marcação.',
  hot: 'Pediu disponibilidade, indicou um prazo ou mostrou intenção de marcar.',
};
const sources = {
  unknown: 'Desconhecida',
  website: 'Site',
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  google: 'Google',
  referral: 'Recomendação',
  other: 'Outra',
};
const $ = selector => document.querySelector(selector);
const field = (form, name) => form.elements.namedItem(name);
const filters = $('#filters');
const clientFilters = $('#client-filters');
const leadForm = $('#lead-form');
const serviceForm = $('#service-form');
const clientDialog = $('#client-dialog');
const appointmentForm = $('#appointment-form');
const currency = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' });
const historyDate = new Intl.DateTimeFormat('pt-PT', {
  dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Lisbon',
});
const localDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Lisbon' });

let services = [];
let currentPage = 1;
let currentView = 'leads';
let leadRequest = 0;
let clientRequest = 0;
let clientPage = 1;
let selectedClientId;
let appointmentPending = false;
let editingLead;
let editingService;
let draggedLead;
let movingLead = false;

function element(tag, className, label) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (label !== undefined) node.textContent = label;
  return node;
}

function setMessage(target, message = '') {
  target.textContent = message;
  target.hidden = !message;
}

function notice(message = '', error = false) {
  const target = $('#notice');
  target.classList.toggle('error', error);
  setMessage(target, message);
}

function selectOptions(select, options, first = '', selected = select.value) {
  const entries = (first ? [['', first], ...options] : options);
  select.replaceChildren(...entries.map(([id, label]) => new Option(label, id)));
  if (entries.some(([id]) => String(id) === String(selected))) select.value = selected;
}

function showLogin(message) {
  leadRequest++;
  clientRequest++;
  services = [];
  for (const form of [leadForm, serviceForm]) {
    form.closest('dialog').close();
    form.reset();
  }
  editingLead = undefined;
  editingService = undefined;
  selectedClientId = undefined;
  clientDialog.close();
  $('#appointment-list').replaceChildren();
  $('#client-contact').textContent = '';
  $('#client-first-contact').textContent = '';
  $('#client-title').textContent = 'Cliente';
  $('#board').replaceChildren();
  $('#summary').replaceChildren();
  $('#value-summary').replaceChildren();
  $('#service-list').replaceChildren();
  $('#client-list').replaceChildren();
  $('#history-list').replaceChildren();
  $('#workspace').hidden = true;
  $('#login').hidden = false;
  setMessage($('#login-error'), message);
  field($('#login-form'), 'password').focus();
}

async function api(path, method = 'GET', body) {
  const options = { method, credentials: 'same-origin', cache: 'no-store' };
  if (body !== undefined) {
    options.headers = { 'Content-Type': 'application/json' };
    options.body = JSON.stringify(body);
  }
  const response = await fetch('/api/admin/' + path, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && path !== 'login' && path !== 'session') {
      showLogin('A sessão terminou. Inicie sessão novamente.');
    }
    const error = new Error(data.error || 'Não foi possível concluir o pedido. Tente novamente.');
    error.status = response.status;
    throw error;
  }
  return data;
}

async function loadServices() {
  const result = await api('services');
  services = result.services;
  selectOptions(field(filters, 'service'),
    services.map(service => [service.id, service.name + (service.active ? '' : ' (inativo)')]), 'Todos');
  setMessage($('#empty-services'), services.length ? '' : 'Ainda não existem serviços. Use «Novo serviço» para cadastrar o primeiro.');
  $('#service-list').replaceChildren(...services.map(service => {
    const card = element('button', 'service-card');
    card.type = 'button';
    card.append(element('strong', '', service.name));
    const details = [
      service.duration_minutes === null ? '' : service.duration_minutes + ' min',
      service.price_cents === null ? '' : currency.format(service.price_cents / 100),
    ].filter(Boolean);
    if (details.length) card.append(element('span', 'card-detail', details.join(' · ')));
    if (service.description) card.append(element('span', 'card-detail', service.description));
    card.append(element('span', 'badge' + (service.active ? ' active' : ''), service.active ? 'Ativo' : 'Inativo'));
    card.addEventListener('click', () => openService(service));
    return card;
  }));
}

function formatDate(date) {
  return date.split('-').reverse().join('/');
}

function formatAppointment(appointment) {
  const [date, time] = appointment.split('T');
  return formatDate(date) + ' às ' + time;
}

async function loadClients(page = clientPage) {
  const request = ++clientRequest;
  const query = new URLSearchParams(new FormData(clientFilters));
  query.set('page', page);
  try {
    const result = await api('clients?' + query);
    if (request !== clientRequest) return;
    const pages = Math.max(1, Math.ceil(result.total / result.page_size));
    if (page > pages) return await loadClients(pages);
    clientPage = page;
    $('#client-list').replaceChildren(...result.clients.map(client => {
      const row = element('tr');
      const name = element('button', 'client-name', client.name);
      name.type = 'button';
      name.addEventListener('click', () => openClient(client.id));
      const nameCell = element('td');
      nameCell.append(name);
      const appointment = client.appointment_at ? formatAppointment(client.appointment_at)
        : appointmentStages.includes(client.stage) ? 'Sem data registada' : '—';
      row.append(nameCell, ...[client.phone, client.email, client.service_name, stages[client.stage], appointment]
        .map(value => element('td', '', value || '—')));
      return row;
    }));
    $('#client-table').hidden = !result.clients.length;
    const hasFilters = [...query].some(([name, value]) => name !== 'page' && value.trim());
    setMessage($('#empty-clients'), result.clients.length ? '' : hasFilters
      ? 'Nenhum cliente corresponde à pesquisa.' : 'Ainda não há contactos com agendamento no histórico.');
    $('#client-pagination').hidden = pages === 1;
    $('#client-previous').disabled = clientPage === 1;
    $('#client-next').disabled = clientPage === pages;
    $('#client-page-label').textContent = 'Página ' + clientPage + ' de ' + pages;
  } catch (error) {
    if (request === clientRequest) notice(error.message, true);
  }
}

function finishDrag() {
  draggedLead = undefined;
  $('#board .dragging')?.classList.remove('dragging');
  $('#board .drop-target')?.classList.remove('drop-target');
}

async function moveLead(lead, stage) {
  if (movingLead || lead.stage === stage) return;
  movingLead = true;
  try {
    await api('leads/' + lead.id + '/stage', 'PATCH', { stage, version: lead.version });
    notice('Lead movido para «' + stages[stage] + '».');
  } catch (error) {
    notice(error.message, true);
  } finally {
    await loadLeads();
    movingLead = false;
  }
}

function renderAppointmentHistory(appointments) {
  $('#no-appointments').hidden = Boolean(appointments.length);
  $('#appointment-list').replaceChildren(...appointments.map(appointment => {
    const item = element('li', 'appointment-entry');
    const status = appointmentStatuses[appointment.status];
    item.append(element('strong', '', formatAppointment(appointment.appointment_at) + ' · ' + status));
    const price = appointment.service_price_cents == null ? '' : currency.format(appointment.service_price_cents / 100);
    const details = [appointment.service_name, price, appointment.linked_to_lead ? 'Gerido pelo pipeline' : ''].filter(Boolean);
    if (details.length) item.append(element('span', 'card-detail', details.join(' · ')));
    if (!appointment.linked_to_lead && appointment.status === 'scheduled') {
      const actions = element('div', 'appointment-actions');
      for (const [nextStatus, label] of [['completed', 'Marcar como realizado'], ['cancelled', 'Cancelar agendamento']]) {
        const button = element('button', 'secondary', label);
        button.type = 'button';
        button.addEventListener('click', () => {
          if (nextStatus === 'cancelled' && !window.confirm('Cancelar este agendamento?')) return;
          changeAppointment('/' + appointment.id, 'PATCH', { status: nextStatus }, 'Estado atualizado.');
        });
        actions.append(button);
      }
      item.append(actions);
    }
    return item;
  }));
}

async function openClient(id) {
  selectedClientId = id;
  try {
    const { client, appointments } = await api('clients/' + id + '/appointments');
    if (selectedClientId !== id || currentView !== 'clients') return;
    appointmentForm.reset();
    const fallback = client.service_name ? 'Serviço do cadastro · ' + client.service_name : 'Sem serviço';
    selectOptions(field(appointmentForm, 'service_id'), services.filter(service => service.active)
      .map(service => [service.id, service.name]), fallback, '');
    $('#client-title').textContent = client.name;
    setMessage($('#client-contact'), [client.phone, client.email].filter(Boolean).join(' · '));
    $('#client-first-contact').textContent = 'Primeiro contacto: ' +
      (client.first_contact_at ? formatAppointment(client.first_contact_at) : 'por registar');
    setMessage($('#client-appointment-status'));
    setMessage($('#client-appointment-error'));
    renderAppointmentHistory(appointments);
    if (!clientDialog.open) clientDialog.showModal();
  } catch (error) {
    if (selectedClientId === id) notice(error.message, true);
  }
}

async function changeAppointment(suffix, method, data, message) {
  if (appointmentPending || !selectedClientId) return;
  const id = selectedClientId;
  const path = 'clients/' + id + '/appointments';
  const submit = appointmentForm.querySelector('[type="submit"]');
  appointmentPending = true;
  submit.disabled = true;
  setMessage($('#client-appointment-error'));
  setMessage($('#client-appointment-status'));
  try {
    await api(path + suffix, method, data);
    if (selectedClientId !== id) return;
    if (method === 'POST') {
      field(appointmentForm, 'appointment_at').value = '';
      field(appointmentForm, 'service_id').value = '';
    }
    const { appointments } = await api(path);
    if (selectedClientId !== id) return;
    renderAppointmentHistory(appointments);
    setMessage($('#client-appointment-status'), message);
  } catch (error) {
    if (selectedClientId === id) setMessage($('#client-appointment-error'), error.message);
  } finally {
    appointmentPending = false;
    submit.disabled = false;
  }
}

function leadCard(lead, today, draggable) {
  const card = element('button', 'lead-card');
  card.type = 'button';
  card.append(element('strong', '', lead.name));
  if (lead.service_name) card.append(element('span', 'card-detail', lead.service_name));
  if (lead.service_price_cents != null) {
    card.append(element('span', 'card-detail lead-price', currency.format(lead.service_price_cents / 100)));
  }
  card.append(element('span', 'badge ' + lead.qualification, qualifications[lead.qualification]));
  if (lead.first_contact_at) {
    card.append(element('span', 'card-detail', 'Primeiro contacto: ' + formatAppointment(lead.first_contact_at)));
  }
  if (lead.next_action) card.append(element('span', 'card-detail', lead.next_action));
  if (lead.follow_up_on) {
    const pending = lead.stage !== 'completed' && lead.stage !== 'lost';
    const overdue = pending && lead.follow_up_on < today;
    card.append(element('span', 'card-detail' + (overdue ? ' overdue' : ''),
      (overdue ? 'Seguimento em atraso: ' : 'Seguimento: ') + formatDate(lead.follow_up_on)));
  }
  if (lead.appointment_at) {
    card.append(element('span', 'card-detail', formatAppointment(lead.appointment_at)));
  }
  card.addEventListener('click', () => openLead(lead.id));
  card.draggable = draggable;
  card.addEventListener('dragstart', event => {
    if (movingLead) {
      event.preventDefault();
      return;
    }
    draggedLead = lead;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(lead.id));
    card.classList.add('dragging');
  });
  card.addEventListener('dragend', finishDrag);
  return card;
}

function renderMetrics(target, metrics) {
  target.replaceChildren(...metrics.map(([label, total]) => {
    const metric = element('div', 'metric');
    metric.append(element('span', '', label), element('strong', '', total));
    return metric;
  }));
}

function renderLeads(result, stageFilter) {
  const totals = Object.fromEntries(result.totals.map(row => [row.stage, row.total]));
  const count = result.totals.reduce((sum, row) => sum + row.total, 0);
  const metrics = [
    ['Leads', count],
    ['Em conversa ou seguimento', (totals.conversation ?? 0) + (totals.follow_up ?? 0)],
    ['Agendamentos feitos', totals.scheduled ?? 0],
    ['Sessões realizadas', totals.completed ?? 0],
  ];
  renderMetrics($('#summary'), metrics);
  const values = Object.fromEntries((result.values ?? []).map(row => [row.stage, row.cents]));
  renderMetrics($('#value-summary'), [
    ['Valor total de agendamentos feitos', currency.format((values.scheduled ?? 0) / 100)],
    ['Valor total de sessões realizadas', currency.format((values.completed ?? 0) / 100)],
  ]);

  const today = localDate.format(new Date());
  const columns = Object.entries(stages).filter(([key]) => !stageFilter || key === stageFilter);
  const board = $('#board');
  finishDrag();
  board.classList.toggle('single-stage', columns.length === 1);
  board.replaceChildren(...columns.map(([key, label]) => {
    const column = element('section', 'column');
    const heading = element('h2', '', label);
    heading.append(element('span', 'count', totals[key] ?? 0));
    column.append(heading);
    for (const lead of result.leads.filter(item => item.stage === key)) {
      column.append(leadCard(lead, today, columns.length > 1));
    }
    column.addEventListener('dragover', event => {
      if (!draggedLead || draggedLead.stage === key) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      column.classList.add('drop-target');
    });
    column.addEventListener('dragleave', event => {
      if (!column.contains(event.relatedTarget)) column.classList.remove('drop-target');
    });
    column.addEventListener('drop', event => {
      if (!draggedLead) return;
      event.preventDefault();
      const lead = draggedLead;
      finishDrag();
      moveLead(lead, key);
    });
    return column;
  }));
  setMessage($('#empty-leads'), count ? '' : 'Nenhum lead corresponde a esta pesquisa.');
  const pages = Math.max(1, Math.ceil(count / result.page_size));
  $('#pagination').hidden = pages === 1;
  $('#previous').disabled = currentPage <= 1;
  $('#next').disabled = currentPage >= pages;
  $('#page-label').textContent = 'Página ' + currentPage + ' de ' + pages;
}

async function loadLeads(page = currentPage) {
  const request = ++leadRequest;
  const query = new URLSearchParams(new FormData(filters));
  query.set('page', page);
  try {
    const result = await api('leads?' + query);
    if (request !== leadRequest) return;
    currentPage = page;
    if (page > 1 && !result.leads.length) return await loadLeads(page - 1);
    renderLeads(result, query.get('stage'));
  } catch (error) {
    if (request === leadRequest) notice(error.message, true);
  }
}

function switchView(view, focus = true) {
  currentView = view;
  $('#view-leads').hidden = view !== 'leads';
  $('#view-clients').hidden = view !== 'clients';
  $('#view-services').hidden = view !== 'services';
  document.querySelectorAll('[data-view]').forEach(button => {
    if (button.dataset.view === view) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  if (focus) $('#' + view + '-title').focus();
}

function updateQualificationHint() {
  $('#qualification-hint').textContent = qualificationHints[field(leadForm, 'qualification').value];
}

function updateAppointmentField() {
  const available = appointmentStages.includes(field(leadForm, 'stage').value);
  $('#appointment-field').hidden = !available;
  field(leadForm, 'appointment_at').disabled = !available;
}

async function openLead(id) {
  const dialog = $('#lead-dialog');
  let lead = { stage: 'new', qualification: 'unrated', source: 'unknown' };
  let history = [];
  if (id !== undefined) {
    try {
      ({ lead, history } = await api('leads/' + id));
    } catch (error) {
      notice(error.message, true);
      return;
    }
  }

  editingLead = lead;
  leadForm.reset();
  $('#lead-title').textContent = id === undefined ? 'Novo lead' : 'Editar lead';
  $('#delete-lead').hidden = !lead.id;
  const serviceOptions = services.filter(service => service.active || service.id === lead.service_id)
    .map(service => [service.id, service.name + (service.active ? '' : ' (inativo)')]);
  const selection = lead.service_id ?? (lead.service_name ? 'deleted' : '');
  if (lead.service_name && !serviceOptions.some(([serviceId]) => serviceId === selection)) {
    serviceOptions.push([selection, lead.service_name + (selection === 'deleted' ? ' (excluído)' : '')]);
  }
  selectOptions(field(leadForm, 'service_id'), serviceOptions, 'Sem serviço', selection);
  for (const [name, value] of Object.entries(lead)) {
    const input = field(leadForm, name);
    if (input && value !== null) input.value = value;
  }
  updateQualificationHint();
  updateAppointmentField();
  $('#campaign').open = ['source', 'medium', 'campaign', 'content', 'term'].some(key => lead['utm_' + key]);
  $('#lead-history').hidden = !history.length;
  $('#history-list').replaceChildren(...history.map(entry => {
    const date = new Date(entry.created_at.replace(' ', 'T') + 'Z');
    return element('li', '', historyDate.format(date) + ' · ' +
      stages[entry.stage] + ' · ' + qualifications[entry.qualification]);
  }));
  setMessage(leadForm.querySelector('.form-error'));
  if (!dialog.open) dialog.showModal();
}

function openService(service = {}) {
  editingService = service;
  serviceForm.reset();
  $('#service-title').textContent = service.id ? 'Editar serviço' : 'Novo serviço';
  $('#delete-service').hidden = !service.id;
  field(serviceForm, 'name').value = service.name ?? '';
  field(serviceForm, 'description').value = service.description ?? '';
  field(serviceForm, 'duration_minutes').value = service.duration_minutes ?? '';
  field(serviceForm, 'price').value = service.price_cents == null ? '' : (service.price_cents / 100).toFixed(2);
  field(serviceForm, 'active').checked = service.active === undefined || Boolean(service.active);
  setMessage(serviceForm.querySelector('.form-error'));
  $('#service-dialog').showModal();
}

async function submitChange(form, request, message, refresh) {
  const buttons = form.querySelectorAll('[type="submit"], .danger');
  if (buttons[0].disabled) return;
  const errorTarget = form.querySelector('.form-error');
  setMessage(errorTarget);
  buttons.forEach(button => { button.disabled = true; });
  try {
    await request();
    form.closest('dialog').close();
    notice(message);
    try {
      await refresh();
    } catch (error) {
      notice(error.message, true);
    }
  } catch (error) {
    setMessage(errorTarget, error.message);
  } finally {
    buttons.forEach(button => { button.disabled = false; });
  }
}

function save(event, resource, existing, data, refresh) {
  event.preventDefault();
  if (existing.id) data.version = existing.version;
  const path = resource + (existing.id ? '/' + existing.id : '');
  submitChange(event.currentTarget, () => api(path, existing.id ? 'PATCH' : 'POST', data),
    resource === 'leads' ? 'Lead guardado.' : 'Serviço guardado.', refresh);
}

async function enterWorkspace() {
  $('#login').hidden = true;
  $('#workspace').hidden = false;
  notice();
  switchView('leads');
  try {
    await loadServices();
  } catch (error) {
    notice(error.message, true);
  }
  if (!$('#workspace').hidden) await loadLeads(1);
}

selectOptions(field(filters, 'stage'), Object.entries(stages), 'Todas');
selectOptions(field(filters, 'qualification'), Object.entries(qualifications), 'Todas');
selectOptions(field(filters, 'source'), Object.entries(sources), 'Todas');
selectOptions(field(clientFilters, 'source'), Object.entries(sources), 'Todas');
selectOptions(field(leadForm, 'stage'), Object.entries(stages));
selectOptions(field(leadForm, 'qualification'), Object.entries(qualifications));
selectOptions(field(leadForm, 'source'), Object.entries(sources));
field(leadForm, 'qualification').setAttribute('aria-describedby', 'qualification-hint');
field(leadForm, 'qualification').addEventListener('change', updateQualificationHint);
field(leadForm, 'stage').addEventListener('change', updateAppointmentField);
document.querySelectorAll('[data-clear-filters]').forEach(button => {
  button.addEventListener('click', () => {
    button.form.reset();
    button.form.requestSubmit();
  });
});

document.querySelectorAll('[data-view]').forEach(button => {
  button.addEventListener('click', () => {
    notice();
    switchView(button.dataset.view);
    if (currentView === 'services') loadServices().catch(error => notice(error.message, true));
    else if (currentView === 'clients') loadClients(1);
    else loadLeads();
  });
});
document.querySelectorAll('[data-close]').forEach(button => {
  button.addEventListener('click', () => button.closest('dialog').close());
});
$('#new-lead').addEventListener('click', () => openLead());
$('#new-service').addEventListener('click', () => openService());
clientDialog.addEventListener('close', () => { selectedClientId = undefined; });
$('#edit-client').addEventListener('click', () => {
  const id = selectedClientId;
  clientDialog.close();
  if (id) openLead(id);
});
appointmentForm.addEventListener('submit', event => {
  event.preventDefault();
  const service = field(appointmentForm, 'service_id').value;
  changeAppointment('', 'POST', {
    appointment_at: field(appointmentForm, 'appointment_at').value,
    service_id: service ? Number(service) : null,
  }, 'Agendamento guardado.');
});
$('#delete-lead').addEventListener('click', () => {
  const { id, name, version } = editingLead;
  if (!window.confirm('Excluir o lead «' + name + '» e o seu histórico?')) return;
  submitChange(leadForm, () => api('leads/' + id, 'DELETE', { version }), 'Lead excluído.',
    currentView === 'clients' ? loadClients : loadLeads);
});
$('#delete-service').addEventListener('click', () => {
  const { id, name, version } = editingService;
  if (!window.confirm('Excluir o serviço «' + name + '»? Os leads existentes mantêm o nome e o valor registados.')) return;
  submitChange(serviceForm, () => api('services/' + id, 'DELETE', { version }), 'Serviço excluído.', loadServices);
});
$('#previous').addEventListener('click', () => loadLeads(currentPage - 1));
$('#next').addEventListener('click', () => loadLeads(currentPage + 1));
$('#client-previous').addEventListener('click', () => loadClients(clientPage - 1));
$('#client-next').addEventListener('click', () => loadClients(clientPage + 1));
clientFilters.addEventListener('submit', event => {
  event.preventDefault();
  notice();
  loadClients(1);
});
filters.addEventListener('submit', event => {
  event.preventDefault();
  notice();
  loadLeads(1);
});

leadForm.addEventListener('submit', event => {
  const data = Object.fromEntries(new FormData(leadForm));
  data.clear_service = data.service_id === '';
  data.service_id = data.service_id && data.service_id !== 'deleted' ? Number(data.service_id) : null;
  save(event, 'leads', editingLead, data,
    currentView === 'clients' ? loadClients : () => loadLeads(editingLead.id ? currentPage : 1));
});
serviceForm.addEventListener('submit', event => {
  const data = Object.fromEntries(new FormData(serviceForm));
  data.duration_minutes = data.duration_minutes === '' ? null : Number(data.duration_minutes);
  data.price_cents = data.price === '' ? null : Math.round(Number(data.price) * 100);
  delete data.price;
  data.active = field(serviceForm, 'active').checked;
  save(event, 'services', editingService, data, loadServices);
});
$('#login-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button');
  button.disabled = true;
  setMessage($('#login-error'));
  try {
    await api('login', 'POST', { password: field(form, 'password').value });
    form.reset();
    await enterWorkspace();
  } catch (error) {
    setMessage($('#login-error'), error.message);
  } finally {
    button.disabled = false;
  }
});
$('#logout').addEventListener('click', async () => {
  try {
    await api('logout', 'POST', {});
    location.reload();
  } catch (error) {
    notice(error.message, true);
  }
});

api('session').then(enterWorkspace).catch(error => showLogin(error.status === 401 ? '' : error.message));
