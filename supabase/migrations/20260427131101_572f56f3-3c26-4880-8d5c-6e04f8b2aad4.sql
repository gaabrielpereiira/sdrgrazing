-- Drop broken trigger and function (referenced non-existent deals.status column)
DROP TRIGGER IF EXISTS auto_create_deal_on_contact ON public.contacts;
DROP FUNCTION IF EXISTS public.auto_create_deal_on_contact() CASCADE;

-- Ensure the correct trigger is active
DROP TRIGGER IF EXISTS trg_create_deal_for_new_contact ON public.contacts;
CREATE TRIGGER trg_create_deal_for_new_contact
  AFTER INSERT ON public.contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.create_deal_for_new_contact();