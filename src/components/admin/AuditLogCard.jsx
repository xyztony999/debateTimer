import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Chip from '@mui/material/Chip';
import FormControl from '@mui/material/FormControl';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import LinearProgress from '@mui/material/LinearProgress';
import ListSubheader from '@mui/material/ListSubheader';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { auditService } from '../../services/auditService';
import {
    AUDIT_EVENT_GROUPS,
    buildAuditQuery,
    detailEntries,
    pageCount,
} from '../../utils/auditView';
import { formatDateTime } from '../../utils/dateTime';

const MONO = { fontFamily: 'Monaco, Consolas, "Courier New", monospace' };
const DASH = '—';
const EMPTY_FILTERS = Object.freeze({ type: '', username: '', from: '', to: '', result: '' });
const RESULTS = ['success', 'failure'];
const COLUMN_COUNT = 7;

/** One detail value in the wording the rest of the page already uses. */
function detailText(kind, raw, t) {
    switch (kind) {
        case 'role':
            return raw === 'admin' ? t('admin.roleAdmin') : t('admin.roleUser');
        case 'lifecycle':
            return raw === 'disabled' ? t('admin.disabled') : t('admin.active');
        case 'switch':
            return raw === true ? t('admin.stateOpen') : t('admin.stateClosed');
        case 'boolean':
            return raw === true ? t('common.yes') : t('common.no');
        case 'empty':
            return DASH;
        default:
            return typeof raw === 'object' ? JSON.stringify(raw) : String(raw);
    }
}

function UserName({ account, t }) {
    // A deleted account keeps its id on the record but has no name any more.
    if (!account) {
        return DASH;
    }
    return <span title={account.id}>{account.username ?? DASH}</span>;
}

/**
 * The audit log, for administrators (admin-page PageSpec §4.6). Read-only by
 * construction: this card has no control that changes, exports or removes
 * anything. It is loaded on its own, so none of it is in the bundle of pages
 * that do not show it.
 *
 * Filters are edited first and sent only by "Apply" (and "Clear filters");
 * turning a page re-sends the filters of the list on screen.
 */
export default function AuditLogCard() {
    const { t, i18n } = useTranslation();
    const [draft, setDraft] = useState(EMPTY_FILTERS);
    const [data, setData] = useState(null); // { items, total }
    const [page, setPage] = useState(1);
    const [state, setState] = useState('loading'); // loading | ready | error | range
    const [busy, setBusy] = useState(false);
    const [expanded, setExpanded] = useState(() => new Set());
    // What the list on screen was asked with, kept for paging and retrying.
    const appliedRef = useRef(EMPTY_FILTERS);
    const lastPageRef = useRef(1);
    const requestSeqRef = useRef(0);

    const run = useCallback(async (target, filters) => {
        const query = buildAuditQuery(filters, target);
        if (!query) {
            // Nothing is asked of the server for a range it would refuse.
            setState('range');
            return;
        }
        const seq = ++requestSeqRef.current;
        lastPageRef.current = target;
        appliedRef.current = filters;
        setBusy(true);
        const result = await auditService.list(query);
        if (seq !== requestSeqRef.current) {
            return;
        }
        setBusy(false);
        if (result.success) {
            setData(result.data);
            setPage(target);
            setState('ready');
        } else {
            setState('error');
        }
    }, []);

    useEffect(() => {
        run(1, EMPTY_FILTERS);
    }, [run]);

    const setDraftField = (field) => (event) => {
        const value = event?.target?.value ?? '';
        setDraft((prev) => ({ ...prev, [field]: value }));
    };

    const apply = () => {
        setExpanded(new Set());
        run(1, draft);
    };

    const clear = () => {
        setDraft(EMPTY_FILTERS);
        setExpanded(new Set());
        run(1, EMPTY_FILTERS);
    };

    const turnPage = (target) => {
        setExpanded(new Set());
        run(target, appliedRef.current);
    };

    const toggleExpanded = (id) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const items = Array.isArray(data?.items) ? data.items : [];
    const total = Number.isInteger(data?.total) ? data.total : 0;
    const pages = pageCount(total);
    const filterBusy = busy || state === 'loading';

    // What a closed select shows. The library shows nothing at all for an
    // empty value unless `displayEmpty` is set (and does not even ask
    // `renderValue`), which would read as "nothing selected" rather than as
    // "no filter". The empty display opens the notch in the outline but does
    // not lift the label into it, so the label is shrunk by hand.
    const typeLabel = (type) => (type ? t(`audit.event.${type}`, { defaultValue: type }) : t('admin.auditFilterAll'));
    const resultLabel = (result) => (result ? t(`audit.result.${result}`, { defaultValue: result }) : t('admin.auditFilterAll'));

    // One flat list with a heading per group: the select walks its children to
    // mark the chosen option, so nothing may be nested inside it.
    const typeOptions = [];
    for (const group of AUDIT_EVENT_GROUPS) {
        typeOptions.push(
            <ListSubheader key={`group-${group.id}`}>{t(`audit.eventGroup.${group.id}`)}</ListSubheader>,
        );
        for (const type of group.types) {
            typeOptions.push(
                <MenuItem key={type} value={type}>{t(`audit.event.${type}`)}</MenuItem>,
            );
        }
    }

    let listing;
    if (state === 'loading') {
        listing = <LinearProgress aria-label={t('admin.auditTitle')} />;
    } else if (state === 'error') {
        listing = (
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <Alert severity="error">{t('common.loadFailed')}</Alert>
                <Button
                    variant="outlined"
                    size="small"
                    onClick={() => run(lastPageRef.current, appliedRef.current)}
                >
                    {t('common.retry')}
                </Button>
            </Stack>
        );
    } else if (state === 'range') {
        listing = <Alert severity="error">{t('admin.auditRangeError')}</Alert>;
    } else {
        listing = (
            <React.Fragment>
                <Box sx={{ overflowX: 'auto', opacity: busy ? 0.5 : 1 }} aria-busy={busy}>
                    <Table size="small" sx={{ whiteSpace: 'nowrap' }}>
                        <TableHead>
                            <TableRow>
                                <TableCell>{t('account.logins.time')}</TableCell>
                                <TableCell>{t('account.logins.event')}</TableCell>
                                <TableCell>{t('account.logins.result')}</TableCell>
                                <TableCell>{t('admin.auditColActor')}</TableCell>
                                <TableCell>{t('admin.auditColSubject')}</TableCell>
                                <TableCell>{t('admin.auditColIp')}</TableCell>
                                <TableCell>{t('admin.auditDetail')}</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {items.length === 0
                                ? (
                                    <TableRow>
                                        <TableCell colSpan={COLUMN_COUNT}>{t('admin.auditEmpty')}</TableCell>
                                    </TableRow>
                                )
                                : items.map((item) => {
                                    const isOpen = expanded.has(item.id);
                                    const entries = detailEntries(item.type, item.detail);
                                    const full = formatDateTime(item.at, i18n.language, 'full');
                                    return (
                                        <React.Fragment key={item.id}>
                                            <TableRow>
                                                <TableCell title={full ?? undefined}>
                                                    {formatDateTime(item.at, i18n.language) ?? DASH}
                                                </TableCell>
                                                <TableCell>
                                                    {t(`audit.event.${item.type}`, { defaultValue: String(item.type ?? '') })}
                                                    {item.anonymized
                                                        ? <Chip size="small" variant="outlined" label={t('admin.auditAnonymized')} sx={{ ml: 1 }} />
                                                        : null}
                                                </TableCell>
                                                <TableCell>
                                                    {t(`audit.result.${item.result}`, { defaultValue: String(item.result ?? '') })}
                                                </TableCell>
                                                <TableCell><UserName account={item.actor} /></TableCell>
                                                <TableCell><UserName account={item.subject} /></TableCell>
                                                <TableCell>
                                                    {item.ip
                                                        ? <Box component="span" sx={MONO}>{item.ip}</Box>
                                                        : DASH}
                                                </TableCell>
                                                <TableCell>
                                                    <IconButton
                                                        size="small"
                                                        aria-label={t('admin.auditDetail')}
                                                        aria-expanded={isOpen}
                                                        disabled={entries.length === 0}
                                                        onClick={() => toggleExpanded(item.id)}
                                                    >
                                                        {isOpen ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                                                    </IconButton>
                                                </TableCell>
                                            </TableRow>
                                            {isOpen
                                                ? (
                                                    <TableRow>
                                                        <TableCell colSpan={COLUMN_COUNT} sx={{ py: 1.5, whiteSpace: 'normal' }}>
                                                            <Stack spacing={0.5}>
                                                                {entries.map((entry) => (
                                                                    <Typography key={entry.key} variant="body2">
                                                                        <Typography component="span" variant="body2" color="text.secondary">
                                                                            {t(`audit.detail.${entry.key}`, { defaultValue: entry.key })}
                                                                            {': '}
                                                                        </Typography>
                                                                        <Box component="span" sx={MONO}>
                                                                            {detailText(entry.kind, entry.raw, t)}
                                                                        </Box>
                                                                    </Typography>
                                                                ))}
                                                            </Stack>
                                                        </TableCell>
                                                    </TableRow>
                                                )
                                                : null}
                                        </React.Fragment>
                                    );
                                })}
                        </TableBody>
                    </Table>
                </Box>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'flex-end', mt: 1.5 }}>
                    <Typography variant="caption" color="text.secondary">
                        {t('admin.auditPageInfo', { page, pages, total })}
                    </Typography>
                    <Button size="small" disabled={busy || page <= 1} onClick={() => turnPage(page - 1)}>
                        {t('account.logins.prev')}
                    </Button>
                    <Button size="small" disabled={busy || page >= pages} onClick={() => turnPage(page + 1)}>
                        {t('account.logins.next')}
                    </Button>
                </Stack>
            </React.Fragment>
        );
    }

    return (
        <Card>
            <CardHeader title={t('admin.auditTitle')} subheader={t('admin.auditDesc')} />
            <CardContent>
                <Stack
                    direction="row"
                    // `gap` rather than the default margins on children: with
                    // margins every wrapped row starts indented by one unit.
                    useFlexGap
                    spacing={1.5}
                    // A floating label sits just above its own top border, so
                    // wrapped rows need more room than items side by side.
                    sx={{ flexWrap: 'wrap', alignItems: 'center', rowGap: 2.5, mb: 2.5 }}
                    role="search"
                    aria-label={t('admin.auditTitle')}
                >
                    <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 180 } }}>
                        <InputLabel id="audit-type-label" shrink>{t('admin.auditFilterType')}</InputLabel>
                        <Select
                            labelId="audit-type-label"
                            id="audit-type"
                            label={t('admin.auditFilterType')}
                            value={draft.type}
                            onChange={setDraftField('type')}
                            displayEmpty
                            renderValue={typeLabel}
                        >
                            <MenuItem value="">{t('admin.auditFilterAll')}</MenuItem>
                            {typeOptions}
                        </Select>
                    </FormControl>
                    <TextField
                        size="small"
                        label={t('admin.auditFilterUser')}
                        value={draft.username}
                        onChange={setDraftField('username')}
                        sx={{ minWidth: { xs: '100%', sm: 150 } }}
                    />
                    <TextField
                        size="small"
                        type="datetime-local"
                        label={t('admin.auditFilterFrom')}
                        value={draft.from}
                        onChange={setDraftField('from')}
                        slotProps={{ inputLabel: { shrink: true } }}
                        sx={{ minWidth: { xs: '100%', sm: 210 } }}
                    />
                    <TextField
                        size="small"
                        type="datetime-local"
                        label={t('admin.auditFilterTo')}
                        value={draft.to}
                        onChange={setDraftField('to')}
                        slotProps={{ inputLabel: { shrink: true } }}
                        sx={{ minWidth: { xs: '100%', sm: 210 } }}
                    />
                    <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 120 } }}>
                        <InputLabel id="audit-result-label" shrink>{t('admin.auditFilterResult')}</InputLabel>
                        <Select
                            labelId="audit-result-label"
                            id="audit-result"
                            label={t('admin.auditFilterResult')}
                            value={draft.result}
                            onChange={setDraftField('result')}
                            displayEmpty
                            renderValue={resultLabel}
                        >
                            <MenuItem value="">{t('admin.auditFilterAll')}</MenuItem>
                            {RESULTS.map((result) => (
                                <MenuItem key={result} value={result}>{t(`audit.result.${result}`)}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    <Button variant="contained" size="small" disabled={filterBusy} onClick={apply}>
                        {t('admin.auditApply')}
                    </Button>
                    <Button size="small" disabled={filterBusy} onClick={clear}>
                        {t('admin.auditClear')}
                    </Button>
                </Stack>
                {listing}
            </CardContent>
        </Card>
    );
}
