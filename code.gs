const SPREADSHEET_ID = "1TmR9kC-Wc83Zw0kWRmC_oWcH0q33W7K1M6XvxaaiDps"; // Replace with your Google Sheet ID

function doGet(e) {
  const params = e ? e.parameter : {}; 
  const action = params.action;
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID);

  try {
    switch (action) {
      case "room-types":
        return handleGetRoomTypes(sheet);
      case "rate-plans":
        return handleGetRatePlans(sheet);
      case "pricing":
        return handleGetPricing(sheet);
      case "availability":
        return handleGetAvailability(sheet, e.parameter);
      default:
        return createJsonResponse({ success: false, error: "Invalid action" });
    }
  } catch (error) {
    return createJsonResponse({ success: false, error: error.message });
  }
}

function doPost(e) {
  const params = e ? e.parameter : {}; 
  const action = params.action;
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID);

  try {
    switch (action) {
      case "book-room":
        return handleBookRoom(sheet, JSON.parse(e.postData.contents));
      default:
        return createJsonResponse({ success: false, error: "Invalid action" });
    }
  } catch (error) {
    return createJsonResponse({ success: false, error: error.message });
  }
}

// ----------- Handlers ------------

function handleGetRoomTypes(sheet) {
  const roomTypesSheet = sheet.getSheetByName("RoomTypes");
  const data = getSheetData(roomTypesSheet);
  return createJsonResponse(data);
}

function handleGetRatePlans(sheet) {
  const ratePlansSheet = sheet.getSheetByName("RatePlans");
  const data = getSheetData(ratePlansSheet);
  return createJsonResponse(data);
}

function handleGetPricing(sheet) {
  const pricingSheet = sheet.getSheetByName("Pricing");
  const data = getSheetData(pricingSheet);
  return createJsonResponse(data);
}

function handleGetAvailability(sheet, params) {
  const checkInDate = new Date(params.checkIn);
  const checkOutDate = new Date(params.checkOut);
  const adults = parseInt(params.adults);
  const children = parseInt(params.children);
  const ratePlanFilter = params.ratePlan === "ALL" ? null : params.ratePlan;

  const roomTypes = getSheetData(sheet.getSheetByName("RoomTypes"));
  const inventory = getSheetData(sheet.getSheetByName("Inventory"));
  const ratePlans = getSheetData(sheet.getSheetByName("RatePlans"));

  const availableRooms = [];

  roomTypes.forEach(roomType => {
    if (adults > roomType.MaxAdults || children > roomType.MaxChildren) {
      return;
    }

    let isAvailableForDates = true;
    let minAvailable = roomType.BaseInventory;

    for (let d = new Date(checkInDate); d < checkOutDate; d.setDate(d.getDate() + 1)) {
      const dateStr = Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd");
      const dailyInventory = inventory.find(
        inv => inv.Date === dateStr && inv.RoomTypeID === roomType.RoomTypeID
      );

      if (dailyInventory) {
        minAvailable = Math.min(minAvailable, dailyInventory.AvailableRooms);
      } else {
        minAvailable = Math.min(minAvailable, roomType.BaseInventory);
      }
    }

    if (minAvailable <= 0) {
      isAvailableForDates = false;
    }

    if (isAvailableForDates) {
      ratePlans.forEach(ratePlan => {
        if (ratePlanFilter && ratePlanFilter !== ratePlan.RatePlanID) {
          return;
        }
        availableRooms.push({
          RoomTypeID: roomType.RoomTypeID,
          RatePlanID: ratePlan.RatePlanID,
          AvailableCount: minAvailable
        });
      });
    }
  });

  return createJsonResponse(availableRooms);
}

function handleBookRoom(sheet, bookingData) {
  const bookingsSheet = sheet.getSheetByName("Bookings");
  const inventorySheet = sheet.getSheetByName("Inventory");
  const roomTypesSheet = sheet.getSheetByName("RoomTypes");

  const checkInDate = new Date(bookingData.checkInDate);
  const checkOutDate = new Date(bookingData.checkOutDate);
  const roomTypeId = bookingData.roomTypeId;

  const roomTypes = getSheetData(roomTypesSheet);
  const roomType = roomTypes.find(rt => rt.RoomTypeID === roomTypeId);
  if (!roomType) {
    throw new Error("Invalid RoomTypeID.");
  }

  for (let d = new Date(checkInDate); d < checkOutDate; d.setDate(d.getDate() + 1)) {
    const dateStr = Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd");
    const inventoryData = getSheetData(inventorySheet);
    const row = inventoryData.findIndex(
      inv => inv.Date === dateStr && inv.RoomTypeID === roomTypeId
    );

    let currentAvailable = roomType.BaseInventory;
    if (row !== -1) {
      currentAvailable = inventoryData[row].AvailableRooms;
    }

    if (currentAvailable <= 0) {
      throw new Error(`Room ${roomType.RoomName} is not available on ${dateStr}.`);
    }
  }

  for (let d = new Date(checkInDate); d < checkOutDate; d.setDate(d.getDate() + 1)) {
    const dateStr = Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd");
    const inventoryData = getSheetData(inventorySheet);
    const row = inventoryData.findIndex(
      inv => inv.Date === dateStr && inv.RoomTypeID === roomTypeId
    );

    if (row !== -1) {
      const headers = getSheetHeaders(inventorySheet);
      const colIndex = headers.indexOf("AvailableRooms") + 1;
      const range = inventorySheet.getRange(row + 2, colIndex);
      range.setValue(parseInt(range.getValue()) - 1);
    } else {
      const headers = getSheetHeaders(inventorySheet);
      const newRow = {};
      headers.forEach(header => newRow[header] = "");
      newRow.Date = dateStr;
      newRow.RoomTypeID = roomTypeId;
      newRow.AvailableRooms = roomType.BaseInventory - 1;
      appendRowToSheet(inventorySheet, newRow);
    }
  }

  const bookingId = "BKG" + Utilities.getUuid().substr(0, 8).toUpperCase();
  const newBooking = {
    BookingID: bookingId,
    GuestName: bookingData.guestName,
    GuestEmail: bookingData.guestEmail,
    CheckInDate: bookingData.checkInDate,
    CheckOutDate: bookingData.checkOutDate,
    RoomTypeID: bookingData.roomTypeId,
    RatePlanID: bookingData.ratePlanId,
    Adults: bookingData.adults,
    Children: bookingData.children,
    TotalPrice: bookingData.totalPrice,
    BookingDate: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss")
  };
  appendRowToSheet(bookingsSheet, newBooking);

  return createJsonResponse({ success: true, bookingId: bookingId });
}

// ----------- Helpers ------------

function getSheetData(sheet) {
  if (!sheet) {
    throw new Error("Sheet not found.");
  }
  const headers = getSheetHeaders(sheet);
  if (sheet.getLastRow() < 2) return [];
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();

  return data.map(row => {
    const obj = {};
    headers.forEach((header, i) => {
      let value = row[i];
      if (!isNaN(value) && value !== "") {
        value = parseFloat(value);
      }
      obj[header] = value;
    });
    return obj;
  });
}

function appendRowToSheet(sheet, rowData) {
  const headers = getSheetHeaders(sheet);
  const newRow = headers.map(header => rowData[header] !== undefined ? rowData[header] : "");
  sheet.appendRow(newRow);
}

function createJsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheetHeaders(sheet) {
  if (!sheet) {
    throw new Error("Sheet not found.");
  }
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
}
