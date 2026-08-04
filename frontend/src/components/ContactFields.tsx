import { BLOOD_GROUPS } from '@vig/shared';
import type { ContactDetailsDto } from '@vig/shared';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';

/**
 * How the school reaches a person, and who to ring if it cannot (020).
 *
 * The same block wherever it appears — the admin adding a teacher or a parent,
 * the admin editing one, and the person themselves under Settings → Profile.
 * One component, so the five fields cannot drift apart between the form that
 * creates a record and the form that maintains it.
 */

export interface ContactForm {
  email: string;
  mobileNumber: string;
  bloodGroup: string;
  address: string;
  emergencyContact: string;
}

export const EMPTY_CONTACT: ContactForm = {
  email: '',
  mobileNumber: '',
  bloodGroup: '',
  address: '',
  emergencyContact: '',
};

/** A record's stored details as form values — nothing recorded reads as ''. */
export function contactFromDto(dto: Partial<ContactDetailsDto> | null | undefined): ContactForm {
  return {
    email: dto?.email ?? '',
    mobileNumber: dto?.mobileNumber ?? '',
    bloodGroup: dto?.bloodGroup ?? '',
    address: dto?.address ?? '',
    emergencyContact: dto?.emergencyContact ?? '',
  };
}

/** Has the form moved away from what is stored? Drives an edit form's Save. */
export function contactChanged(
  form: ContactForm,
  dto: Partial<ContactDetailsDto> | null | undefined,
): boolean {
  const stored = contactFromDto(dto);
  return (Object.keys(stored) as Array<keyof ContactForm>).some(
    (key) => form[key].trim() !== stored[key].trim(),
  );
}

export function ContactFields({
  value,
  onChange,
  idPrefix,
  /** The parent form requires a number; everywhere else the block is optional. */
  mobileRequired = false,
}: {
  value: ContactForm;
  onChange: (next: ContactForm) => void;
  idPrefix: string;
  mobileRequired?: boolean;
}) {
  const set = (key: keyof ContactForm) => (next: string) => onChange({ ...value, [key]: next });

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field
        label="Email"
        htmlFor={`${idPrefix}-email`}
        hint="Kept on file. Nothing is sent to it."
      >
        <Input
          id={`${idPrefix}-email`}
          type="email"
          value={value.email}
          onChange={(e) => set('email')(e.target.value)}
          placeholder="name@example.com"
        />
      </Field>

      <Field
        label="Mobile number"
        htmlFor={`${idPrefix}-mobile`}
        required={mobileRequired}
        hint={mobileRequired ? 'How the school reaches this family.' : undefined}
      >
        <Input
          id={`${idPrefix}-mobile`}
          type="tel"
          inputMode="tel"
          value={value.mobileNumber}
          onChange={(e) => set('mobileNumber')(e.target.value)}
          placeholder="+91 98765 43210"
        />
      </Field>

      <Field label="Blood group" htmlFor={`${idPrefix}-blood`}>
        <Select
          id={`${idPrefix}-blood`}
          value={value.bloodGroup}
          onChange={(e) => set('bloodGroup')(e.target.value)}
        >
          <option value="">Not recorded</option>
          {BLOOD_GROUPS.map((group) => (
            <option key={group} value={group}>
              {group}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Emergency contact"
        htmlFor={`${idPrefix}-emergency`}
        hint="Rung if this person cannot be reached."
      >
        <Input
          id={`${idPrefix}-emergency`}
          type="tel"
          inputMode="tel"
          value={value.emergencyContact}
          onChange={(e) => set('emergencyContact')(e.target.value)}
          placeholder="+91 98765 43210"
        />
      </Field>

      <div className="sm:col-span-2">
        <Field label="Address" htmlFor={`${idPrefix}-address`}>
          <Textarea
            id={`${idPrefix}-address`}
            rows={3}
            value={value.address}
            onChange={(e) => set('address')(e.target.value)}
            placeholder="House, street, area, city, PIN"
          />
        </Field>
      </div>
    </div>
  );
}
