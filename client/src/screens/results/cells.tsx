import { Filled } from '../../components/Filled'
import { formatPhone } from '../../lib/format'
import type { Lead } from '../../types'

export function OwnerCell({ lead }: { lead: Lead }) {
  if (!lead.ownerName) return <span className="text-tx3">Not found</span>
  return (
    <span className="flex flex-col items-start gap-0.5">
      <Filled lead={lead} field="ownerName">
        {lead.ownerName}
      </Filled>
      {lead.ownerRole === 'founder' && <span className="text-xs text-tx3">founder: ask for the current owner</span>}
    </span>
  )
}

export function ContactCell({ lead }: { lead: Lead }) {
  const v = lead.validation
  const phoneOk = Boolean(lead.phone && v?.phoneValid)
  const emailOk = Boolean(lead.email && v?.emailDomainAcceptsMail)
  return (
    <div className="flex min-w-0 flex-col gap-1.5 text-[13px]">
      <div className="flex min-w-0 items-center gap-2">
        <span aria-hidden className={`w-3 font-bold ${phoneOk ? 'text-tier-a' : 'text-bad'}`}>
          {phoneOk ? '✓' : '✗'}
        </span>
        {lead.phone ? (
          <span title={phoneOk ? 'Valid US phone number' : 'Not a valid US number'}>
            <Filled lead={lead} field="phone" mono>
              {formatPhone(lead.phone)}
            </Filled>
          </span>
        ) : (
          <span className="text-tx3">No phone</span>
        )}
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <span aria-hidden className={`w-3 font-bold ${emailOk ? 'text-tier-a' : 'text-bad'}`}>
          {emailOk ? '✓' : '✗'}
        </span>
        {lead.email ? (
          <span className="min-w-0 truncate" title={emailOk ? 'Domain accepts email (has MX records). Not a verified inbox.' : "The email's domain doesn't accept mail"}>
            <Filled lead={lead} field="email">
              {lead.email}
            </Filled>
          </span>
        ) : (
          <span className="text-tx3">No email</span>
        )}
      </div>
    </div>
  )
}

export function YearsCell({ lead }: { lead: Lead }) {
  if (lead.yearsInBusiness === null) return <span className="text-tx3">—</span>
  return (
    <span title={`Founded ${lead.yearFounded}`}>
      <Filled lead={lead} field="yearFounded" mono>
        {String(lead.yearsInBusiness)}
      </Filled>
    </span>
  )
}
