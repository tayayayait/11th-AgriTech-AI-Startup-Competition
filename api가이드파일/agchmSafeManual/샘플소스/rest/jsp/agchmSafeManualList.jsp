<%@page import="java.util.HashMap"%>
<%@page import="java.io.InputStream"%>
<%@page import="java.net.URLEncoder"%>
<%@page import="org.w3c.dom.NodeList"%>
<%@page import="org.w3c.dom.Node"%>
<%@page import="org.w3c.dom.Element"%>
<%@page import="javax.xml.parsers.DocumentBuilderFactory"%>
<%@page import="org.w3c.dom.Document"%>
<%@page import="java.net.URL"%>

<%@ page language="java" contentType="text/html; charset=UTF-8"
    pageEncoding="UTF-8"%>
<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN" "http://www.w3.org/TR/html4/loose.dtd">
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<title>농약안전사용지침</title>
<script type="text/javascript">
//검색
function fncSearch(){
	with(document.searchApiForm){
		sNationVal.value = fncCheckValue(document.getElementsByName("sNationChk"));
		pageNo.value = "1";
		method="get";
		action = "agchmSafeManualList.jsp";
		target = "_self";
		submit();
	}
}
//페이지 이동
function fncGoPage(page){
	with(document.searchApiForm){
		pageNo.value = page;
		method="get";
		action = "agchmSafeManualList.jsp";
		target = "_self";
		submit();
	}
}

function fncCheckValue(obj){
	var checkValue = "";

	for(var i=0; i<obj.length; i++){
		if(obj[i].checked == true){
			checkValue += obj[i].value + ",";
		}
	}

	if(checkValue!="") checkValue = checkValue.substring(0, checkValue.length-1);

	return checkValue;
}

</script>
</head>
<body>
<h4><strong> * 샘플화면은 디자인을 적용하지 않았으니, 개별 사이트의 스타일에 맞게 코딩하시기 바랍니다.</strong></h4>
<h3><strong>농약안전사용지침</strong></h3>
<hr>
<form name="searchApiForm">
<input type="hidden" name="pageNo" value="<%=request.getParameter("pageNo")==null?"":request.getParameter("pageNo")%>">
<input type="hidden" name="sNationVal" value="<%=request.getParameter("sNationVal")==null?"":request.getParameter("sNationVal")%>">
<table width="100%" border="1" cellSpacing="0" cellPadding="0">
	<colgroup>
		<col width="20%"/>
		<col width="80%"/>
	</colgroup>
	<tr>
		<th>
			검색조건
		</th>
		<td>
			지침명 <input type="text" name="sCntntsSj" value="<%=request.getParameter("sCntntsSj")==null?"":request.getParameter("sCntntsSj")%>">
			작목 <input type="text" name="sPrdlstCodeNm" value="<%=request.getParameter("sPrdlstCodeNm")==null?"":request.getParameter("sPrdlstCodeNm")%>">
			개정년도 <input type="text" name="sReformYear" value="<%=request.getParameter("sReformYear")==null?"":request.getParameter("sReformYear")%>">
			<input type="button" name="search" value="검색" onclick="return fncSearch();"/>
		</td>
	</tr>
<%
	//apiKey - 농사로 Open API에서 신청 후 승인되면 확인 가능
	String apiKey="nongsaroSampleKey"; //apiKey - 농사로 Open API에서 신청 후 승인되면 확인 가능
	//서비스 명
	String serviceName="agchmSafeManual";
	//오퍼레이션 명
	String[] operationName = {"nationList"};

	HashMap<String, Document> operationNameMap = new HashMap<String, Document>();

	Document doc = null;

	for(int i=0; i<operationName.length; i++){
		//XML 받을 URL 생성
		String parameter = "/"+serviceName+"/"+operationName[i];
		parameter += "?apiKey="+ apiKey;

		//서버와 통신
		URL apiUrl = new URL("http://api.nongsaro.go.kr/service"+parameter);
		InputStream apiStream = apiUrl.openStream();

		try{
			//xml document
			doc = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(apiStream);
			operationNameMap.put(operationName[i], doc);
		}catch(Exception e){
			e.printStackTrace();
		}finally{
			apiStream.close();
		}
	}

	int size = 0;
	String resultCode="";
	String resultMsg="";
	NodeList items = null;
	NodeList codes = null;
	NodeList codeNms = null;

	if(operationNameMap.containsKey("nationList")){
		doc=operationNameMap.get("nationList");

		items = doc.getElementsByTagName("item");
		size = doc.getElementsByTagName("item").getLength();
		codes = doc.getElementsByTagName("code");
		codeNms = doc.getElementsByTagName("codeNm");

		try{resultCode = doc.getElementsByTagName("resultCode").item(0).getFirstChild().getNodeValue();}catch(Exception e){resultCode = "";}
		try{resultMsg = doc.getElementsByTagName("resultMsg").item(0).getFirstChild().getNodeValue();}catch(Exception e){resultMsg = "";}

		out.print("<tr><th>국가</th><td>");
		if(resultCode.equals("00")){
			for(int i=0; i<size; i++){
				//코드
				String code = codes.item(i).getFirstChild() == null ? "" : codes.item(i).getFirstChild().getNodeValue();
				//코드명
				String codeNm = codeNms.item(i).getFirstChild() == null ? "" : codeNms.item(i).getFirstChild().getNodeValue();
%>
				<input type="checkbox" id="sNationChk" name="sNationChk" value="<%=code%>" <%
				if(request.getParameter("sNationVal") != null){
					String chkVar = request.getParameter("sNationVal");
					String[] chkArr = chkVar.split(",");
					for(int j=0; j<chkArr.length; j++){
						if(code.equals(chkArr[j])){
							out.print("checked");
						}
					}
				}
				%> /><%=codeNm%>&nbsp;
<%
			}

		}else{
			out.print("조회한 정보가 없습니다.");
		}
		out.print("</td></tr>");
	}
%>
	</table>
</form>

<%
	//목록
	if(operationName.length == operationNameMap.size()){
		//오퍼레이션 명
		String operationNameList="agchmSafeManualList";

		//XML 받을 URL 생성
		String parameter = "/"+serviceName+"/"+operationNameList;
		parameter += "?apiKey="+ apiKey;
		parameter += "&pageNo="+request.getParameter("pageNo");

		//검색 조건
		String[] searchNmArr = {"sCntntsSj", "sPrdlstCodeNm", "sReformYear", "sNationVal"};
		for(int i=0; i<searchNmArr.length; i++){
			if(request.getParameter(searchNmArr[i])!=null && !request.getParameter(searchNmArr[i]).equals("")){
				parameter += "&"+searchNmArr[i]+"="+ request.getParameter(searchNmArr[i]);
			}
		}
		//서버와 통신
		URL apiUrl = new URL("http://api.nongsaro.go.kr/service"+parameter);
		InputStream apiStream = apiUrl.openStream();

		try{
			//xml document
			doc = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(apiStream);
		}catch(Exception e){
			e.printStackTrace();
		}finally{
			apiStream.close();
		}

		NodeList cntntsNos = null;
		NodeList nationCodeNms = null;
		NodeList prdlstCodeNms = null;
		NodeList reformYms = null;
		NodeList cntntsSjs = null;
		NodeList fileUrls = null;
		NodeList fileNms = null;

		items = doc.getElementsByTagName("item");
		size = doc.getElementsByTagName("item").getLength();

		cntntsNos = doc.getElementsByTagName("cntntsNo");
		nationCodeNms = doc.getElementsByTagName("nationCodeNm");
		prdlstCodeNms = doc.getElementsByTagName("prdlstCodeNm");
		reformYms = doc.getElementsByTagName("reformYm");
		cntntsSjs = doc.getElementsByTagName("cntntsSj");
		fileUrls = doc.getElementsByTagName("fileUrl");
		fileNms = doc.getElementsByTagName("fileNm");

		try{resultCode = doc.getElementsByTagName("resultCode").item(0).getFirstChild().getNodeValue();}catch(Exception e){resultCode = "";}
		try{resultMsg = doc.getElementsByTagName("resultMsg").item(0).getFirstChild().getNodeValue();}catch(Exception e){resultMsg = "";}

		if(resultCode.equals("00")){ %>
		<hr>
		<table width="100%" border="1" cellSpacing="0" cellPadding="0">
		<colgroup>
			<col width="*"/>
			<col width="*"/>
			<col width="*"/>
			<col width="*"/>
			<col width="*"/>
		</colgroup>
		<tr>
			<th>국가</th>
			<th>작목</th>
			<th>개정년월</th>
			<th>지침명</th>
			<th>첨부파일</th>
		</tr>
<%
		if(size==0){
%>
			<tr>
				<td colspan="5" align="center">조회된 정보가 없습니다.</td>
			</tr>
<%
		}else{
			for(int i=0; i<size; i++){
				//국가
				String nationCodeNm = nationCodeNms.item(i).getFirstChild() == null ? "" : nationCodeNms.item(i).getFirstChild().getNodeValue();
				//작목
				String prdlstCodeNm = prdlstCodeNms.item(i).getFirstChild() == null ? "" : prdlstCodeNms.item(i).getFirstChild().getNodeValue();
				//개정년월
				String reformYm = reformYms.item(i).getFirstChild() == null ? "" : reformYms.item(i).getFirstChild().getNodeValue();
				//지침명
				String cntntsSj = cntntsSjs.item(i).getFirstChild() == null ? "" : cntntsSjs.item(i).getFirstChild().getNodeValue();
				//첨부파일 URL
				String fileUrl = fileUrls.item(i).getFirstChild() == null ? "" : fileUrls.item(i).getFirstChild().getNodeValue();
				//첨부파일명
				String fileNm = fileNms.item(i).getFirstChild() == null ? "" : fileNms.item(i).getFirstChild().getNodeValue();
%>
			<tr>
				<td align="center"><%=nationCodeNm%></td>
				<td align="center"><%=prdlstCodeNm%></td>
				<td align="center"><%=reformYm%></td>
				<td><%=cntntsSj%></td>
				<td align="center"><a href="<%=fileUrl%>">파일다운로드</a></td>
			</tr>
<%
			}
		}
%>
	</table>
<%

	//페이징 처리
		//한 페이지에 제공할 건수
		String numOfRows = "";
		//조회된 총 건수
		String totalCount = "";
		//조회할 페이지 번호
		String pageNo = "";
		try{numOfRows = doc.getElementsByTagName("numOfRows").item(0).getFirstChild().getNodeValue();}catch(Exception e){numOfRows = "";}
		try{totalCount = doc.getElementsByTagName("totalCount").item(0).getFirstChild().getNodeValue();}catch(Exception e){totalCount = "";}
		try{pageNo = doc.getElementsByTagName("pageNo").item(0).getFirstChild().getNodeValue();}catch(Exception e){pageNo = "";}

		int pageGroupSize = 10;
		int pageSize = 0;
		try{
			pageSize = Integer.parseInt(numOfRows);
		}catch(Exception e){
			pageSize = 10;
		}
		int start = 0;
		try{
			start = Integer.parseInt(pageNo);
		}catch(Exception e){
			start = 1;
		}

		int currentPage = 1;
		try{currentPage = Integer.parseInt(pageNo);}catch(Exception e){}

		int startRow = (currentPage - 1) * pageSize + 1;//한 페이지의 시작글 번호
		int endRow = currentPage * pageSize;//한 페이지의 마지막 글번호
		int count = Integer.parseInt(totalCount);
		int number=0;

		number=count-(currentPage-1)*pageSize;//글목록에 표시할 글번호

		//페이지그룹의 갯수
		//ex) pageGroupSize가 3일 경우 '[1][2][3]'가 pageGroupCount 개 만큼 있다.
		int pageGroupCount = count/(pageSize*pageGroupSize)+( count % (pageSize*pageGroupSize) == 0 ? 0 : 1);
		//페이지 그룹 번호
		//ex) pageGroupSize가 3일 경우  '[1][2][3]'의 페이지그룹번호는 1 이고  '[2][3][4]'의 페이지그룹번호는 2 이다.
		int numPageGroup = (int) Math.ceil((double)currentPage/pageGroupSize);


		if(count > 0){
			int pageCount = count / pageSize + ( count % pageSize == 0 ? 0 : 1);
			int startPage = pageGroupSize*(numPageGroup-1)+1;
			int endPage = startPage + pageGroupSize-1;
			int prtPageNo = 0;

			if(endPage > pageCount){
				endPage = pageCount;
			}

			if(numPageGroup > 1){
				prtPageNo = (numPageGroup-2)*pageGroupSize+1;
				out.println("<a href='javascript:fncGoPage("+prtPageNo+");'>[이전]</a>");
			}

			for(int i=startPage; i<=endPage; i++){
				prtPageNo = i;
				out.print("<a href='javascript:fncGoPage("+prtPageNo+");'>");
				if(currentPage == i){
					out.print("<strong>["+i+"]</strong>");
				}else{
					out.print("["+i+"]");
				}
				out.println("</a>");
			}

			if(numPageGroup < pageGroupCount){
				prtPageNo = (numPageGroup*pageGroupSize+1);
				out.println("<a href='javascript:fncGoPage("+prtPageNo+");'>[다음]</a>");
			}
		}
		//페이징 처리 끝
		}else{
			out.print(resultMsg);
		}
	}
%>
</body>
</html>