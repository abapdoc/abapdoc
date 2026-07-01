FUNCTION zpet_utility_get_pet_name.
  "! Resolve a pet's display name from the database.
  "!
  "! @parameter iv_pet_id      the pet primary key
  "! @parameter ev_pet_name   the resolved display name
  "! @raising   cx_sy_itab_line_not_found
  DATA: lv_name TYPE string.

  SELECT SINGLE name
    FROM ztpet
    INTO lv_name
    WHERE pet_id = iv_pet_id.

  IF sy-subrc <> 0.
    RAISE EXCEPTION TYPE cx_sy_itab_line_not_found.
  ENDIF.

  ev_pet_name = lv_name.

ENDFUNCTION.